import fastify, { FastifyInstance } from "fastify";
import { ApolloServer } from "apollo-server-fastify";
import { configureAgent } from "node-iframe";
import { CronJob } from "cron";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";
import type { Server as HttpServer } from "http";

import { config, logServerInit, fastifyConfig, corsOptions } from "./config";
import {
  crawlAllAuthedWebsitesCluster,
  WebsitesController,
} from "./core/controllers/websites";
import { createIframe as createIframeEvent } from "./core/controllers/iframe";
import {
  getBaseParams,
  paramParser,
  validateUID,
} from "./web/params/extracter";
import { CONFIRM_EMAIL, IMAGE_CHECK, UNSUBSCRIBE_EMAILS } from "./core/routes";
import {
  initDbConnection,
  closeDbConnection,
  createPubSub,
  initRedisConnection,
  closeRedisConnection,
} from "./database";
import { confirmEmail, detectImage, unSubEmails } from "./web/routes";
import { statusBadge } from "./web/routes/resources/badge";
import { scanAuthenticated, scanSimple } from "./web/routes/scan";
import { setGithubActionRoutes } from "./web/routes_groups/github-actions";
import { setAuthRoutes } from "./web/routes_groups/auth";
import { startGRPC } from "./proto/init";
import { killServer as killGrpcServer } from "./proto/website-server";
import { getUserFromToken } from "./core/utils";
import { retreiveUserByTokenWrapper } from "./core/utils/get-user-data";
import { getWebsiteAPI, getWebsiteReport } from "./web/routes/data/website";
import { AnalyticsController } from "./core/controllers";
import { crawlStream } from "./core/streams/crawl";
import { crawlStreamSlim } from "./core/streams/crawl-slim";
import { getServerConfig } from "./apollo-server";
import { establishCrawlTracking } from "./event";
import { updateWebsite } from "./core/controllers/websites/update";
import { execute, subscribe } from "graphql";
import { PageSpeedController } from "./core/controllers/page-speed/main";
import { registerApp } from "./web/register";
import { setListRoutes } from "./web/routes_groups/list";
import { StatusCode } from "./web/messages/message";
import { responseWrap } from "./web/response";
import { getWebParams } from "./web/params/web";
import { addWebsiteWrapper } from "./core/controllers/websites/set/add-website";
import { getWebsiteWrapper } from "./core/controllers/websites/find/get";
import { responseModel } from "./core/models";
import { limiter, scanLimiter } from "./web/limiters";
import { appEmitter } from "./event/emitters/control";
import { setStripeRoutes } from "./web/routes_groups/stripe";
import { setAdsRoutes } from "./web/routes_groups/ads";
import { setDnsVerifyRoutes } from "./web/routes_groups/dns-verify";
import { backgroundSync } from "./web/routes/sync";

// configure one app-wide setting for user agents on node-iframe request
configureAgent();

const { GRAPHQL_PORT } = config;

let coreServer: HttpServer; // core http app server
let serverInited = false; // determine if the server started
let serverReady = false; // server is ready to go

// all the connections for external request
const connectClients = async () => {
  await initDbConnection(); // database connections
  await initRedisConnection(); // redis connections
  await createPubSub(); // redis gql pub/sub
};

async function initServer(): Promise<HttpServer[]> {
  let serverCleanup; // cleanup the ws server
  const gqlServerConfig = getServerConfig({
    plugins: [
      {
        async serverWillStart() {
          return {
            async drainServer() {
              serverCleanup?.dispose();
            },
          };
        },
      },
    ],
  });

  // graphql server
  const server = new ApolloServer(gqlServerConfig);

  await server.start(); // start the graphql server

  const fast: FastifyInstance = await fastify(fastifyConfig);
  await fast.register(await server.createHandler({ cors: corsOptions }));
  const app = await registerApp(fast);

  // report badges
  app.get("/status/:domain", limiter, statusBadge);
  // domain renderer [todo?: handle at edge]
  app.get("/api/iframe", limiter, createIframeEvent);
  // get a previus run report
  app.get("/api/report", limiter, getWebsiteReport);
  // retrieve a user from the database
  app.get("/api/user", async (req, res) => {
    const auth = req.headers.authorization || req.cookies.jwt;

    await responseWrap(res, {
      callback: () => retreiveUserByTokenWrapper(auth),
      auth,
    });
  });
  // get a website from the database
  app.get("/api/website", async (req, res) => {
    const { userId, domain, pageUrl } = getBaseParams(req);

    await responseWrap(res, {
      callback: () =>
        getWebsiteWrapper({
          userId,
          domain,
          url: pageUrl,
        }),
      userId,
    });
  });

  // retrieve a page analytic from the database.
  app.get("/api/analytics", async (req, res) => {
    const { userId, domain, pageUrl } = getBaseParams(req);

    await responseWrap(res, {
      callback: () =>
        AnalyticsController().getWebsite({
          userId,
          pageUrl: pageUrl ? pageUrl : undefined,
          domain: domain ? domain : undefined,
        }),
      userId,
    });
  });

  // retrieve a pagespeed from the database.
  app.get("/api/pagespeed", async (req, res) => {
    const { userId, domain, pageUrl } = getBaseParams(req);

    await responseWrap(res, {
      callback: () =>
        PageSpeedController().getWebsite({
          userId,
          pageUrl: pageUrl ? pageUrl : undefined,
          domain: domain ? domain : undefined,
        }),
      userId,
    });
  });

  /*
   * Single page scan nostore - example with limited response for domain
   */
  app.post("/api/scan-simple", limiter, scanSimple);

  /*
   * Single page scan
   */
  app.post(
    "/api/scan",
    {
      config: {
        rateLimit: {
          max: 8,
          timeWindow: "1 minute",
        },
      },
    },
    scanAuthenticated
  );
  /*
   * All websites site wide scan background sync.
   */
  app.post("/api/websites-sync", scanLimiter, backgroundSync);
  /*
   * Site wide scan handles via stream.
   * Uses Event based handling to extract pages.
   */
  app.post("/api/crawl", scanLimiter, crawlStream);
  app.post("/api/crawl-stream", scanLimiter, crawlStream);

  /*
   * Site wide scan handles via stream slim data sized.
   * Uses Event based handling to extract pages.
   */
  app.post("/api/crawl-stream-slim", scanLimiter, crawlStreamSlim);

  // get base64 to image name
  app.post(IMAGE_CHECK, limiter, detectImage);

  /*
   * Update website configuration.
   * This sets the website configuration for crawling like user agents, headers, and etc.
   */
  app.put("/api/website", async (req, res) => {
    const usr = getUserFromToken(req.headers.authorization || req.cookies.jwt);
    const userId = usr?.payload?.keyid;

    if (!validateUID(userId)) {
      res.status(StatusCode.Unauthorized);

      return res.send({
        data: null,
        message: "Authentication required",
      });
    }

    const url = paramParser(req, "url");
    const customHeaders = paramParser(req, "customHeaders");
    const mobile = paramParser(req, "mobile");
    const pageInsights = paramParser(req, "pageInsights");
    const ua = paramParser(req, "ua");
    const standard = paramParser(req, "standard");
    const actions = paramParser(req, "actions");
    const subdomains = paramParser(req, "subdomains");
    const tld = paramParser(req, "tld");

    const { website } = await updateWebsite({
      userId,
      url,
      pageHeaders: customHeaders,
      mobile,
      pageInsights,
      ua,
      standard,
      actions,
      subdomains,
      tld,
    });

    return res.send({
      data: website,
      message: "Website updated",
    });
  });

  /*
   * Add website.
   * This sets the website configuration for crawling like user agents, headers, and etc.
   */
  app.post("/api/website", async (req, res) => {
    const usr = getUserFromToken(req.headers.authorization || req.cookies.jwt);
    const userId = usr?.payload?.keyid;

    await responseWrap(res, {
      callback: () =>
        addWebsiteWrapper({
          userId,
          canScan: false,
          // configuration
          ...getWebParams(req),
        }),
      userId,
    });
  });

  /*
   * Delete website and all related data.
   * This removes the website from the database it can be by a url, domain, or empty poping the db entry.
   */
  app.delete("/api/website", async (req, res) => {
    const usr = getUserFromToken(req.headers.authorization || req.cookies.jwt);
    const userId = usr?.payload?.keyid;

    const url = paramParser(req, "url");
    const deleteMany = paramParser(req, "deleteMany");
    const domain = paramParser(req, "domain");

    await responseWrap(res, {
      callback: () =>
        WebsitesController().removeWebsite({
          userId,
          deleteMany,
          url,
          domain,
        }),
      userId,
    });
  });

  // used for reports on client-side Front-end. TODO: remove for /reports/ endpoint.
  app.get("/api/get-website", getWebsiteAPI);

  setDnsVerifyRoutes(app);
  setAdsRoutes(app);
  setListRoutes(app);
  setAuthRoutes(app);
  setGithubActionRoutes(app);
  setStripeRoutes(app);

  // EMAIL
  // unsubscribe to emails or Alerts.
  app.get(UNSUBSCRIBE_EMAILS, unSubEmails);
  app.post(UNSUBSCRIBE_EMAILS, unSubEmails);
  // email confirmation route
  app.get(CONFIRM_EMAIL, confirmEmail);
  app.post(CONFIRM_EMAIL, confirmEmail);

  // INTERNAL [todo: whitelist]
  app.get("/_internal_/healthcheck", (_, res) => {
    res.send({
      status: "healthy",
    });
  });

  // An error handling middleware
  await app.setErrorHandler(function (error, _request, reply) {
    const statusCode = error?.statusCode || StatusCode.Error;

    reply.status(statusCode).send(
      responseModel({
        code: statusCode,
        success: false,
        message: error?.message,
      })
    );
  });

  await app.listen(GRAPHQL_PORT, "0.0.0.0");

  const subscriptionServer = new WebSocketServer({
    server: app.server,
    path: server.graphqlPath,
  });

  serverCleanup = useServer(
    {
      schema: gqlServerConfig.schema,
      execute,
      subscribe,
      onConnect(cnxnParams) {
        const u = getUserFromToken(
          cnxnParams?.connectionParams?.authorization as string
        );

        // allow passing userId to request
        if (u) {
          return {
            userId: u?.payload?.keyid,
          };
        }

        return false;
      },
      context(ctx) {
        const u = getUserFromToken(
          ctx?.connectionParams?.authorization as string
        );

        return {
          userId: u?.payload?.keyid ?? -1,
        };
      },
    },
    subscriptionServer
  );

  logServerInit(GRAPHQL_PORT, {
    graphqlPath: server.graphqlPath,
  });

  new CronJob("0 11,23 * * *", crawlAllAuthedWebsitesCluster).start();

  return [app.server];
}

// start the http, graphl, events, subs, and gRPC server
const startServer = async (disableHttp?: boolean) => {
  if (!serverInited) {
    serverInited = true; // do not wait for http server and rely on grpc health check
    if (config.SUPER_MODE) {
      console.log(
        "Application started in SUPER mode. All restrictions removed."
      );
    }
    // tracking event emitter
    establishCrawlTracking(); // quick setup all event emitters binding

    // gRPC startup
    const [_, __, [hcore]] = await Promise.all([
      connectClients(),
      startGRPC(),
      !disableHttp ? initServer() : Promise.resolve([]),
    ]);

    coreServer = hcore;
    serverReady = true;

    return new Promise((resolve) => {
      appEmitter.emit("event:init", true);

      resolve([coreServer]);
    });
  }

  return Promise.resolve([]);
};

// determine if the server is ready
const isReady = async () => {
  return new Promise((resolve) => {
    if (serverReady) {
      resolve(true);
    } else {
      appEmitter.once("event:init", () => resolve(true));
    }
  });
};

// shutdown the everything
const killServer = async () => {
  await Promise.all([
    coreServer?.close(),
    closeDbConnection(),
    closeRedisConnection(),
    killGrpcServer(),
  ]);
  serverReady = false;
  serverInited = false;
};

export { coreServer, isReady, killServer, initServer, startServer };

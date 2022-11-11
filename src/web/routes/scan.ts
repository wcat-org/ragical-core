import { getUserFromApi, getUserFromToken } from "../../core/utils";
import { scanWebsite, crawlPage } from "../../core/actions";
import { paramParser, validateUID } from "../params/extracter";
import { GENERAL_ERROR, WEBSITE_URL_ERROR } from "../../core/strings";
import { responseModel } from "../../core/models";
import { StatusCode } from "../messages/message";
import { frontendClientOrigin } from "../../core/utils/is-client";
import type { FastifyContext } from "apollo-server-fastify";

/*
 * SCAN -> PAGEMIND: Single page [does not store values to cdn]
 **/
export const scanSimple = async (
  req: FastifyContext["request"],
  res: FastifyContext["reply"]
) => {
  const baseUrl = paramParser(req, "websiteUrl") || paramParser(req, "url");
  const url = baseUrl ? decodeURIComponent(baseUrl) : "";

  if (!url) {
    res.status(400);
    res.send(
      responseModel({
        code: StatusCode.BadRequest,
        data: null,
        message: WEBSITE_URL_ERROR,
      })
    );
    return;
  }

  const isClient =
    frontendClientOrigin(req.headers["origin"]) ||
    frontendClientOrigin(req.headers["host"]) ||
    frontendClientOrigin(req.headers["referer"]);

  if (!isClient) {
    const user = getUserFromToken(
      req?.headers?.authorization || req?.cookies?.jwt
    );

    // validate user creds
    if (!user) {
      res.status(403);
      res.send(
        responseModel({
          code: StatusCode.Error,
          data: null,
          message: GENERAL_ERROR,
        })
      );
      return;
    }
  }

  const pageInsights =
    paramParser(req, "pageInsights") || paramParser(req, "pageInsights");

  const resData = await scanWebsite({
    url,
    noStore: true,
    pageInsights,
  });

  res.send(resData);
};

/*
 * SCAN -> PAGEMIND: Single page authenticated route
 **/
export const scanAuthenticated = async (
  req: FastifyContext["request"],
  res: FastifyContext["reply"]
) => {
  const baseUrl = paramParser(req, "websiteUrl") || paramParser(req, "url");
  const url = baseUrl ? decodeURIComponent(baseUrl) : "";

  if (!url) {
    res.status(400);
    res.send(
      responseModel({
        code: StatusCode.BadRequest,
        data: null,
        message: WEBSITE_URL_ERROR,
      })
    );
    return;
  }

  // returns truthy if can continue
  const userNext = await getUserFromApi(
    req?.headers?.authorization || req?.cookies?.jwt,
    req,
    res
  );
  const userId = userNext?.id;
  const pageInsights =
    paramParser(req, "pageInsights") || paramParser(req, "pageInsights");

  let resData = {};

  if (validateUID(userId)) {
    resData = await crawlPage(
      {
        url,
        userId,
        pageInsights,
        sendSub: false,
      },
      false
    );
  }

  res.send(resData);
};

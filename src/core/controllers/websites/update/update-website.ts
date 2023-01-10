import { Website } from "../../../../types/schema";
import { WEBSITE_NOT_FOUND, SUCCESS } from "../../../../core/strings";
import { connect } from "../../../../database";
import { getWebsite } from "../find";

// update a website by properties from form input on adding/
export const updateWebsite = async ({
  userId,
  url,
  pageHeaders,
  pageInsights,
  mobile,
  standard,
  ua,
  actions,
  robots = true,
  tld,
  subdomains,
  ignore,
  rules,
  runners,
}: Partial<Website> & { actions?: Record<string, unknown>[] }) => {
  const [website, collection] = await getWebsite({ userId, url });

  if (!website) {
    throw new Error(WEBSITE_NOT_FOUND);
  }

  const actionsEnabled = actions && Array.isArray(actions) && actions.length;

  // params prior - we mutate this on update
  const pageParams = {
    pageHeaders: website.pageHeaders,
    pageInsights: website.pageInsights,
    mobile: website.mobile,
    standard: website.standard,
    ua: website.ua ? website.ua : undefined,
    actionsEnabled,
    robots,
    subdomains: !!website.subdomains,
    tld: !!website.tld,
    ignore: website.ignore,
    rules: website.rules,
    runners: website.runners,
  };

  // if page headers are sent add them
  if (typeof pageHeaders !== "undefined" && Array.isArray(pageHeaders)) {
    const pageHeaderSrc =
      pageHeaders?.length === 1 && !pageHeaders[0].key ? null : pageHeaders;

    pageParams.pageHeaders = pageHeaderSrc;
  }

  // if lighthouse is enabled
  if (typeof pageInsights !== "undefined") {
    pageParams.pageInsights = !!pageInsights;
  }

  // if mobile viewport is enabled
  if (typeof mobile !== "undefined") {
    pageParams.mobile = !!mobile;
  }

  // if standard is set
  if (typeof standard !== "undefined") {
    pageParams.standard = standard;
  }

  // if user agent is defined
  if (typeof ua !== "undefined") {
    pageParams.ua = ua;
  }

  // if user tld is defined
  if (typeof tld !== "undefined") {
    pageParams.tld = tld;
  }

  // if user subdomains is defined
  if (typeof subdomains !== "undefined") {
    pageParams.subdomains = subdomains;
  }

  const accessRules = [];

  // rules limit
  if (rules && Array.isArray(rules)) {
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];

      // validate rule storing
      if (rule && typeof rule === "string" && rule.length < 200) {
        accessRules.push(rule);
      }
      // limit 250 items
      if (i > 250) {
        break;
      }
    }

    pageParams.rules = accessRules;
  }

  const ignoreRules = [];

  // ignore limit
  if (ignore && Array.isArray(ignore)) {
    for (let i = 0; i < ignore.length; i++) {
      const rule = ignore[i];
      // validate rule storing
      if (rule && typeof rule === "string" && rule.length < 200) {
        ignoreRules.push(rule);
      }
      // limit 250 items
      if (i > 250) {
        break;
      }
    }
    pageParams.ignore = ignoreRules;
  }

  const testRunners = [];

  // runners
  if (runners && Array.isArray(runners)) {
    for (let i = 0; i < runners.length; i++) {
      const runner = runners[i];
      // validate rule storing
      if (
        runner &&
        typeof runner === "string" &&
        ["htmlcs", "axe"].includes(runner)
      ) {
        testRunners.push(runner);
      }
      // limit 250 items
      if (i > 3) {
        break;
      }
    }
    pageParams.runners = testRunners;
  }

  await collection.updateOne({ url, userId }, { $set: pageParams });

  // store into actions collection TODO: validate actions
  if (actionsEnabled && actions) {
    const [actionsCollection] = connect("PageActions");
    const domain = website.domain;

    for (let i = 0; i < actions.length; i++) {
      // prevent large actions from running
      if (i > 1000) {
        break;
      }
      const action = actions[i];
      const update = {
        $set: {
          ...action,
          userId,
          domain,
        },
      };
      const path =
        action.path && action.path[0] === "/" ? action.path : `/${action.path}`;

      await actionsCollection.updateOne(
        {
          userId,
          domain,
          path,
        },
        update,
        { upsert: true }
      );
    }
  }

  return {
    website: { ...website, ...pageParams, actions },
    code: 200,
    success: true,
    message: SUCCESS,
  };
};

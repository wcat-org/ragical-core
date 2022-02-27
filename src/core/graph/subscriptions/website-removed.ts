import { withFilter } from "apollo-server";
import { WEBSITE_REMOVED } from "../../static";
import { pubsub } from "./pubsub";

export const websiteRemoved = {
  subscribe: withFilter(
    () => pubsub.asyncIterator(WEBSITE_REMOVED),
    (payload: any, variables: any, context: any) => {
      const id = payload.websiteRemoved.userId;

      return id === context?.userId || id === variables?.userId;
    }
  ),
};

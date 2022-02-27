import * as find from "./find";
import * as set from "./set";
import * as remove from "./remove";
import * as update from "./update";

// TODO: RENAME PAGES
const SubDomainController = ({ user } = { user: null }) => {
  return {
    ...find,
    ...set,
    ...remove,
    ...update,
  };
};

export { SubDomainController };

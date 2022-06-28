import { getDomains, getPage, getAllPages } from "./find";
import { addDomain } from "./set";
import { removeDomain } from "./remove";
import { generateWebsiteScore } from "./update";

// Page outside the main website
const PagesController = ({ user } = { user: null }) => {
  return {
    getDomains,
    getPage,
    getAllPages,
    addDomain,
    removeDomain,
    generateWebsiteScore,
  };
};

export { PagesController };

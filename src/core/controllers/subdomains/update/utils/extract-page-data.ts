export const extractPageData = (
  dataSource: any = { script: null, issues: null, webPage: null }
) => {
  let errorCount;
  let warningCount;
  let noticeCount;
  let adaScore;
  let issuesInfo;
  let pageHasCdn;
  let { script, issues, webPage } = dataSource;

  if (webPage) {
    issuesInfo = webPage.issuesInfo;
    pageHasCdn = webPage.cdnConnected;
    if (issuesInfo) {
      errorCount = issuesInfo.errorCount;
      warningCount = issuesInfo.warningCount;
      adaScore = issuesInfo.adaScore;
      noticeCount = issuesInfo.noticeCount;
    }
    if (webPage?.insight) {
      webPage.insight = {
        json: JSON.stringify(webPage?.insight),
      };
    }
  }

  return {
    errorCount,
    warningCount,
    noticeCount,
    adaScore,
    pageHasCdn,
    script,
    issues,
    webPage,
    issuesInfo,
  };
};

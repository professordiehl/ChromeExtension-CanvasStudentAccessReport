//Written by Jason Diehl, eLearning Systems Administrator, Oaks Christian School 2016.

/*jshint
    browser: true, nomen: true, regexp: true, devel: true
*/

/*globals
    chrome
*/

var ruleUoaCanvas = {
    conditions: [
        new chrome.declarativeContent.PageStateMatcher({
            pageUrl: {
                hostEquals: 'oakschristian.instructure.com',
                schemes: ['https']
            }
        }),
        new chrome.declarativeContent.PageStateMatcher({
            pageUrl: {
                hostEquals: 'oakschristian.test.instructure.com',
                schemes: ['https']
            }
        })
    ],
    actions: [new chrome.declarativeContent.ShowPageAction()]
};

chrome.runtime.onInstalled.addListener(function (details) {
    chrome.declarativeContent.onPageChanged.removeRules(undefined, function () {
        chrome.declarativeContent.onPageChanged.addRules([ruleUoaCanvas]);
    });
});


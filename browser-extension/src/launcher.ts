// The worker only launches a user-requested inspector. It never observes a page,
// executes a content script, stores browsing data, or contacts a service.
chrome.action.onClicked.addListener(tab => {
  if (tab.id === undefined) return;
  const url = new URL(chrome.runtime.getURL('popup.html'));
  url.searchParams.set('sourceTab', String(tab.id));
  void chrome.windows.create({ url: url.href, type: 'popup', width: 800, height: 850 });
});

'use strict';
// Keep links shared before the workspace moved to /app useful.
const publishedExamples = new Set(['deadline', 'reschedule', 'meeting-time', 'scope', 'format', 'priority', 'delivery', 'revision', 'receipt']);
function openExistingWorkspaceLink() {
  const example = new URLSearchParams(location.search).get('example');
  if (location.hash !== '#workspace' && !publishedExamples.has(example)) return;
  const query = publishedExamples.has(example) ? `?example=${encodeURIComponent(example)}` : '';
  location.replace(`/app${query}#workspace`);
}
openExistingWorkspaceLink();
window.addEventListener('hashchange', openExistingWorkspaceLink);

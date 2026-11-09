import { getPageMetadata } from '../src/utils/pageMetadata';
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
/** Only fixed metadata is substituted. Neither Host nor protocol/query data is reflected. */
export function renderPageHtml(template: string, path: string) {
  const metadata = getPageMetadata(path);
  let html = template.replace(
    /<title>[^<]*<\/title>/,
    () => '<title>' + escapeHtml(metadata.title) + '</title>',
  );
  for (const [key, value] of [
    ['description', metadata.description],
    ['og:title', metadata.title],
    ['og:description', metadata.description],
  ]) {
    const pattern = new RegExp(
      '(<meta\\s+(?:name|property)="' + key + '"\\s+content=")[^"]*("\\s*\\/?>)',
    );
    html = html.replace(pattern, (_match, before, after) => before + escapeHtml(value) + after);
  }
  return html;
}

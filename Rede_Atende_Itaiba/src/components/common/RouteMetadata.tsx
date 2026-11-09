import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getPageMetadata, ROBOTS_POLICY } from '../../utils/pageMetadata';
export function RouteMetadata() {
  const { pathname } = useLocation();
  useEffect(() => {
    const metadata = getPageMetadata(pathname);
    document.title = metadata.title;
    const setMeta = (attribute: 'name' | 'property', name: string, content: string) => {
      let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${name}"]`);
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attribute, name);
        document.head.append(element);
      }
      element.content = content;
    };
    setMeta('name', 'description', metadata.description);
    setMeta('name', 'robots', ROBOTS_POLICY);
    setMeta('property', 'og:title', metadata.title);
    setMeta('property', 'og:description', metadata.description);
    document.head.querySelector('link[rel="canonical"]')?.remove();
    document.head.querySelector('meta[property="og:url"]')?.remove();
    if (metadata.canonicalPath) {
      const url = new URL(metadata.canonicalPath, window.location.origin).href;
      const link = document.createElement('link');
      link.rel = 'canonical';
      link.href = url;
      document.head.append(link);
      setMeta('property', 'og:url', url);
    }
  }, [pathname]);
  return null;
}

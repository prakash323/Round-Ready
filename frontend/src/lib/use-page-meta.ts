import { useEffect } from "react";

/**
 * Per-route title and description.
 *
 * A client-rendered app has one `index.html`, so the tab title never changes
 * on navigation unless something sets it — which breaks browser history, tab
 * switching and bookmarks. This is the whole requirement, so it does not
 * warrant a helmet dependency.
 *
 * Only public routes pass a description. A student's board is private, and
 * putting "11 of 18 drives open" in a meta tag is exactly the kind of leak
 * that is invisible until it is not.
 */
export function usePageMeta(title: string, description?: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `RoundReady — ${title}` : "RoundReady";

    let restoreDescription: (() => void) | undefined;
    if (description) {
      const tag = document.querySelector('meta[name="description"]');
      if (tag) {
        const original = tag.getAttribute("content");
        tag.setAttribute("content", description);
        restoreDescription = () => {
          if (original === null) tag.removeAttribute("content");
          else tag.setAttribute("content", original);
        };
      }
    }

    return () => {
      document.title = previous;
      restoreDescription?.();
    };
  }, [title, description]);
}

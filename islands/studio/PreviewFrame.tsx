import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DEVICES, previewDocument, type Device } from "../../src/studio/previews";

/**
 * The isolated preview.
 *
 * `sandbox="allow-same-origin"` WITHOUT `allow-scripts`: nothing inside can
 * run, submit a form, open a popup or navigate the page, while the studio can
 * still reach into the document to swap the stylesheet. That swap is what
 * makes edits appear instantly — reloading `srcdoc` on every keystroke would
 * flash the frame white. The body is only rebuilt when the view changes.
 *
 * Clicks are additionally cancelled from outside, so a `href="#"` in a demo
 * page does not even scroll the frame.
 */
export function PreviewFrame({
  css,
  body,
  prefix,
  theme,
  device,
  lang,
  title,
  height = 720,
}: {
  css: string;
  body: string;
  prefix: string;
  theme: string | null;
  /** A device width scaled to fit, or `"fit"`: the frame's own width at 1:1. */
  device: Device | "fit";
  lang: "de" | "en";
  title: string;
  height?: number;
}) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const wrap = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [fitWidth, setFitWidth] = useState(640);
  const width = device === "fit" ? fitWidth : DEVICES[device];
  // The document is rebuilt only when its BODY changes; css and theme are patched in.
  const [srcDoc, setSrcDoc] = useState(() => previewDocument({ css, prefix, body, theme, lang }));
  const latest = useRef({ css, theme });
  latest.current = { css, theme };

  useEffect(() => {
    setSrcDoc(previewDocument({ css: latest.current.css, prefix, body, theme: latest.current.theme, lang }));
  }, [body, prefix, lang]);

  const patch = () => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    const style = doc.getElementById("ds-css");
    if (style && style.textContent !== latest.current.css) style.textContent = latest.current.css;
    if (latest.current.theme) doc.documentElement.setAttribute("data-theme", latest.current.theme);
    else doc.documentElement.removeAttribute("data-theme");
  };

  useEffect(patch, [css, theme]);

  const onLoad = () => {
    patch();
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    const block = (e: Event) => {
      const target = e.target as Element | null;
      if (e.type === "submit" || target?.closest?.("a, button, form, input[type=submit]")) e.preventDefault();
    };
    doc.addEventListener("click", block, true);
    doc.addEventListener("submit", block, true);
  };

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      if (device === "fit") {
        setFitWidth(Math.max(240, el.clientWidth));
        setScale(1);
      } else setScale(Math.min(1, el.clientWidth / width));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, device]);

  const frameHeight = Math.round(height / Math.max(scale, 0.3));

  return (
    <div ref={wrap} className="dss-frame w-full overflow-hidden" style={{ height: Math.round(frameHeight * scale) }}>
      <iframe
        ref={frame}
        title={title}
        sandbox="allow-same-origin"
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
        onLoad={onLoad}
        style={{
          width,
          height: frameHeight,
          border: 0,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          display: "block",
          background: "transparent",
        }}
      />
    </div>
  );
}

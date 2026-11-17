"use client";

import { useEffect } from "react";

/**
 * Scroll effects for the home page, with no library:
 * - [data-reveal] elements below the fold fade and rise in as they scroll into view
 *   (stagger them with style={{ "--d": i }}).
 * - [data-count] numbers count up from zero the first time they're seen.
 * Everything is rendered in its final state on the server, so with no JavaScript, or with
 * reduced motion, the page simply shows as it is.
 */
export function ScrollFx() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;

    const below = (el: Element) => el.getBoundingClientRect().top > window.innerHeight * 0.9;

    const reveal = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.remove("is-pending");
          e.target.classList.add("is-in");
          reveal.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    document.querySelectorAll("[data-reveal]").forEach((el) => {
      if (!below(el)) return;
      el.classList.add("is-pending");
      reveal.observe(el);
    });

    const frames: number[] = [];
    const count = (el: HTMLElement) => {
      const to = Number(el.dataset.count);
      const start = performance.now();
      const dur = 1400;
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.round(to * eased).toLocaleString("en-US");
        if (t < 1) frames.push(requestAnimationFrame(tick));
      };
      frames.push(requestAnimationFrame(tick));
    };
    const counter = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          count(e.target as HTMLElement);
          counter.unobserve(e.target);
        }
      },
      { threshold: 0.6 },
    );
    document.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => {
      if (!below(el)) return;
      el.textContent = "0";
      counter.observe(el);
    });

    return () => {
      reveal.disconnect();
      counter.disconnect();
      frames.forEach(cancelAnimationFrame);
    };
  }, []);

  return null;
}

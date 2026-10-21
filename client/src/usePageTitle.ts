import { useEffect } from "react";

/**
 * Names the browser tab after the page: "Games · Jolt".
 *
 * Every page used to share index.html's one title, so tabs, history entries
 * and a screen reader's page announcement could not tell Home from a lesson.
 * Pass null while the name is still loading; the previous title stands until
 * there is something true to say.
 */
export function pageTitle(name: string): string {
    return `${name} · Jolt`;
}

export function usePageTitle(name: string | null | undefined): void {
    useEffect(() => {
        if (name) document.title = pageTitle(name);
    }, [name]);
}

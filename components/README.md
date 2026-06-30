# Components

This is our Components library built on top of
[Catalyst](https://catalyst.tailwindui.com/), which internally uses
[HeadlessUI](https://headlessui.com/react/menu).

## Testing Changes

```
pnpm run dev
```

For local test page (see `test` folder)

## Using in other packages

The library is consumed as TypeScript source directly — there is no build step.
Apps in this workspace depend on it via `"components": "link:../../components"`
and the consuming app's Vite/tsc pick up `lib/main.ts` through the package
`exports`. (The app's tsconfig needs `"allowImportingTsExtensions": true`.)

```
import { Button } from "components";
```

## CSS Setup

This library ships **no pre-built CSS**. Your app must provide Tailwind CSS v4 and the
required design tokens.

### 1. Import Tailwind and the design tokens

Copy the contents of [`test/index.css`](./test/index.css) into your app's CSS entry point (e.g. `src/index.css`). It
provides:

- `@import "tailwindcss"` — Tailwind v4 base
- `@custom-variant dark` — selector-based dark mode via the `.dark` class
- `@theme` — brand color scale (`--color-brand-*`), semantic colors (`--color-accent`, `--color-success`,
  `--color-warning`, `--color-danger`, `--color-info`), radius tokens (`--radius-card`, `--radius-control`,
  `--radius-pill`), and shadow tokens
- `@layer base` — surface tokens (`--surface-page`, `--surface-card`, `--surface-popover`, `--surface-muted`) for both
  light and dark mode, scrollbar styling, and dark-mode toast overrides

```css
/* src/index.css */
@import "tailwindcss";
@import "components/styles"; /* required — tells Tailwind v4 to scan the component library */

@custom-variant dark (&:where(.dark, .dark *));

@theme {
    --color-brand-50: var(--color-blue-50);
    /* … copy the full @theme block from test/index.css … */
}

@layer base {
    /* … copy the full @layer base block from test/index.css … */
}
```

### 2. Import react-toastify styles

The `notify` helper (from `toast.tsx`) requires the `react-toastify` stylesheet. Import it once in your app entry point:

```ts
import "react-toastify/dist/ReactToastify.css";
```

Then render `<ToastContainer />` near the root of your component tree:

```tsx
import {ToastContainer} from "react-toastify";

export function App() {
    return (
        <>
            <Router/>
            <ToastContainer/>
        </>
    );
}
```

### 3. Dark mode

Add the following `theme.js` script to your app entry point:

```js
(() => {
    if (
        localStorage.theme === "dark" ||
        (!("theme" in localStorage) && window.matchMedia("(prefers-color-scheme: dark)").matches)
    ) {
        document.documentElement.classList.add("dark");
    } else {
        document.documentElement.classList.remove("dark");
    }
})();
```

---

## Migrating from copied components

For now you can check for equivalence of components by comparing the checksums
within your components directory with those of the initial commit, listed below.

Files which are the same as the checksums below can just be deleted and the
imports adjusted.

```
# sha1sum *
054b41b8df7aa8475ff0b2c7b5203351b203cfc3  alert.tsx
0d09f081b1fd4932f44f292f64c5bee19e1fba71  avatar.tsx
f9db20c7b11a185a5951592f5b558fb5df27c965  badge.tsx
6bdde854a95c372e4028fdc01d07af29f0c5aea8  button.tsx
b9f222b56388d46b3b1b1a4c29bea0e0c959a01c  checkbox.tsx
844682705a943f27975eae96c5fc05f90175921a  combobox.tsx
d4fb4f388db6c68747de20c286def2f65ed95ca4  description-list.tsx
d0ec1409faa5396fa78e74e95629676ff05ccf3c  dialog.tsx
23a523a15d0ce1c89bd4840d89250021e35a4c69  divider.tsx
09e88f2d357f17aefa681545d145dcd30433e0cd  dropdown.tsx
fd56dda1893dd0dd5d6f82214df50a111581e14a  fieldset.tsx
55e2f309f5bd0235fde6b3eea033545b040dd9ca  file-input.tsx
df63980b453222a2dd4b86e54463baf5322232e4  form.tsx
8f4cba155a25df0b6412020f16394f65500e2dcf  heading-layout.tsx
83a0346d5d613121301793672efb7ee84497d277  heading.tsx
5c5c279f84924ba7a02e10be3473902d3adf29ec  input.tsx
06f0544fc9ee7cd814ece180fc193b5c28349478  language-select.tsx
64b4a6bfc16ca6954894c9e06aec401e5071db18  link.tsx
1c99fd8d32cb38985671fe03f019ecab7b525c01  listbox.tsx
ced65ecf441c8256b4933397c9528b23c4862261  navbar.tsx
2f85f6f671f7f8d1a54bfd6bee43dd4ac6cf2241  pagination.tsx
1fe8d415e56f1999c0c8fa23d5e1923687644d43  progress-bar.tsx
f8fdc393498a4f41288a77b77292d11dd5ad2a63  radio.tsx
42ed0a55bb43569cce4c16f4671756ebef881692  reorder-list.tsx
8af63d3b2a89c79f5145e9760834dd3086694ed7  select.tsx
5d50d941cec04508b6892857607436407f689e54  sidebar-layout.tsx
21fe158471eb7f066a0171a32e17e93ff182a75c  sidebar.tsx
31a3063fa039271df158182f673f9fcbbce8c513  stacked-layout.tsx
285ef81e01c1659bafb40f5b6763becaba01858d  step-bar.tsx
e2bb6fdf0da8da9c1cd77cb6abbbd3d700a7b74f  switch.tsx
42bbd83dd525edf3b647ea6ba2fac8f907a182b3  tab-layout.tsx
da41cf0ae7c5db97ea1225f464d796a203fdde0b  tab-menu.tsx
c63692b67610e3aa5b47501e5285d0db537fc727  table.tsx
cb87d30bd8e2cc96b2966c02492c5d297777d687  text.tsx
c01a67e2fe0ab03974f3e30d2384905477b119f9  textarea.tsx
67327ca0749f94896d94eb4a4bd300257b8c3076  unsaved-changes.tsx
c4be17d1b2e7675969c2d28fcef12d1a3866d5c4  user-info.tsx
```

Currently no extra changes have been made other than a lot of added
documentation and some more exported types. Migrating will stop being possible
as easily once the components get extended with new functionality or get changed
in behavior.

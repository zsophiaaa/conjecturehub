/** Runs before paint to avoid a flash of the wrong theme. */
export function ThemeScript() {
  const script = `(function(){try{var t=localStorage.getItem("conjecturehub-theme");if(t!=="light"&&t!=="dark")t="dark";document.documentElement.classList.toggle("dark",t==="dark");}catch(e){document.documentElement.classList.add("dark");}})();`;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

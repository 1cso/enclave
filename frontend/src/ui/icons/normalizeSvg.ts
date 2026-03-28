/** Strip fixed dimensions so CSS controls size via font-size / width / height on wrapper. */
export function normalizeSvgForTheme(svg: string): string {
  let s = svg
    .replace(/<\?xml[^>]*\?>/gi, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .trim();

  s = s
    .replace(/\s*width="[^"]*"/gi, "")
    .replace(/\s*height="[^"]*"/gi, "")
    .replace(/\s*width='[^']*'/gi, "")
    .replace(/\s*height='[^']*'/gi, "");

  s = s.replace(/fill="#[0-9a-fA-F]{3,8}"/gi, 'fill="currentColor"');
  s = s.replace(/fill='#([0-9a-fA-F]{3,8})'/gi, "fill='currentColor'");

  return s;
}

// Grebbans Handover Plugin — code.ts
// Extracts variables, text styles, effect styles, and grid styles from the current Figma file

figma.showUI(__html__, { width: 760, height: 640, themeColors: true });

figma.ui.onmessage = async (msg) => {
  if (msg.type === "extract") {
    const payload = await extractAll();
    figma.ui.postMessage({ type: "data", payload });
  }
  if (msg.type === "close") {
    figma.closePlugin();
  }
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface ColorToken {
  name: string;
  hex: string;
  alpha: number;
  rgba: string;
  cssVar: string;
  group: string;
  isGridColor: boolean;
}

interface NumberToken {
  name: string;
  value: number;
  unit: string;
  cssVar: string;
  group: string;
  scope: string[];
}

interface StringToken {
  name: string;
  value: string;
  cssVar: string;
  group: string;
}

interface TextStyle {
  name: string;
  fontFamily: string;
  fontStyle: string;
  fontSize: number;
  lineHeight: string;
  letterSpacing: string;
  textTransform: string;
  cssClass: string;
}

interface EffectStyle {
  name: string;
  type: string;
  cssValue: string;
  description: string;
}

interface GridStyle {
  name: string;
  columns: number;
  gutter: number;
  margin: number;
  breakpoint: string;
}

interface VariableCollection {
  name: string;
  modes: string[];
  colors: ColorToken[];
  numbers: NumberToken[];
  strings: StringToken[];
}

interface ExtractedData {
  fileName: string;
  extractedAt: string;
  variables: VariableCollection[];
  textStyles: TextStyle[];
  effectStyles: EffectStyle[];
  gridStyles: GridStyle[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toHex(r: number, g: number, b: number): string {
  const toH = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0").toUpperCase();
  return `#${toH(r)}${toH(g)}${toH(b)}`;
}

function toRgba(r: number, g: number, b: number, a: number): string {
  const ri = Math.round(r * 255);
  const gi = Math.round(g * 255);
  const bi = Math.round(b * 255);
  if (a >= 1) return `rgb(${ri}, ${gi}, ${bi})`;
  return `rgba(${ri}, ${gi}, ${bi}, ${Math.round(a * 100) / 100})`;
}

function toCssVar(path: string): string {
  return "--" + path.toLowerCase().replace(/\s*\/\s*/g, "-").replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
}

function scopeLabel(scopes: VariableScope[]): string {
  if (scopes.includes("ALL_SCOPES")) return "all";
  return scopes.map(s => s.toLowerCase().replace(/_/g, " ")).join(", ");
}

function isGridColor(name: string, description: string): boolean {
  return (
    name.toLowerCase().includes("grid") ||
    description.toLowerCase().includes("grid colour") ||
    description.toLowerCase().includes("layout grid")
  );
}

// ─── Variable Extraction ──────────────────────────────────────────────────────

async function extractVariables(): Promise<VariableCollection[]> {
  const collections = figma.variables.getLocalVariableCollections();
  const result: VariableCollection[] = [];

  for (const col of collections) {
    const modes = col.modes.map(m => m.name);
    const modeId = col.defaultModeId;

    const colors: ColorToken[] = [];
    const numbers: NumberToken[] = [];
    const strings: StringToken[] = [];

    for (const varId of col.variableIds) {
      const variable = figma.variables.getVariableById(varId);
      if (!variable) continue;

      const rawValue = variable.valuesByMode[modeId];
      const nameParts = variable.name.split("/");
      const group = nameParts.length > 1 ? nameParts.slice(0, -1).join(" / ") : "root";
      const shortName = nameParts[nameParts.length - 1];
      const cssVar = toCssVar(variable.name);
      const desc = variable.description || "";

      if (variable.resolvedType === "COLOR" && typeof rawValue === "object" && "r" in rawValue) {
        const c = rawValue as RGBA;
        colors.push({
          name: shortName,
          hex: toHex(c.r, c.g, c.b),
          alpha: Math.round(c.a * 100) / 100,
          rgba: toRgba(c.r, c.g, c.b, c.a),
          cssVar,
          group,
          isGridColor: isGridColor(variable.name, desc),
        });
      }

      if (variable.resolvedType === "FLOAT" && typeof rawValue === "number") {
        const scopes = variable.scopes as VariableScope[];
        let unit = "px";
        if (scopes.includes("FONT_SIZE")) unit = "px";
        if (scopes.includes("LINE_HEIGHT")) unit = "px";
        if (scopes.includes("OPACITY")) unit = "";

        numbers.push({
          name: shortName,
          value: rawValue,
          unit,
          cssVar,
          group,
          scope: scopes,
        });
      }

      if (variable.resolvedType === "STRING" && typeof rawValue === "string") {
        strings.push({
          name: shortName,
          value: rawValue,
          cssVar,
          group,
        });
      }
    }

    result.push({ name: col.name, modes, colors, numbers, strings });
  }

  return result;
}

// ─── Text Style Extraction ────────────────────────────────────────────────────

function extractTextStyles(): TextStyle[] {
  const styles = figma.getLocalTextStyles();
  return styles.map(s => {
    const lh = s.lineHeight;
    const ls = s.letterSpacing;

    let lineHeightStr = "normal";
    if (lh.unit === "PIXELS") lineHeightStr = `${lh.value}px`;
    if (lh.unit === "PERCENT") lineHeightStr = `${lh.value}%`;

    let letterSpacingStr = "normal";
    if (ls.unit === "PIXELS") letterSpacingStr = `${ls.value}px`;
    if (ls.unit === "PERCENT") letterSpacingStr = `${(ls.value / 100).toFixed(3)}em`;

    const textTransform =
      s.textCase === "UPPER" ? "uppercase"
      : s.textCase === "LOWER" ? "lowercase"
      : s.textCase === "TITLE" ? "capitalize"
      : "none";

    const cssClass = s.name.toLowerCase().replace(/\s*\/\s*/g, "__").replace(/[^a-z0-9_-]/g, "-");

    return {
      name: s.name,
      fontFamily: s.fontName.family,
      fontStyle: s.fontName.style,
      fontSize: s.fontSize,
      lineHeight: lineHeightStr,
      letterSpacing: letterSpacingStr,
      textTransform,
      cssClass,
    };
  });
}

// ─── Effect Style Extraction ──────────────────────────────────────────────────

function extractEffectStyles(): EffectStyle[] {
  const styles = figma.getLocalEffectStyles();
  return styles.map(s => {
    const cssValues: string[] = [];

    for (const effect of s.effects) {
      if (!effect.visible) continue;

      if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") {
        const { color, offset, radius, spread } = effect as ShadowEffect;
        const inset = effect.type === "INNER_SHADOW" ? "inset " : "";
        const c = `rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},${Math.round(color.a * 100) / 100})`;
        cssValues.push(`${inset}${offset.x}px ${offset.y}px ${radius}px ${spread ?? 0}px ${c}`);
      }

      if (effect.type === "LAYER_BLUR") {
        cssValues.push(`blur(${(effect as BlurEffect).radius}px)`);
      }

      if (effect.type === "BACKGROUND_BLUR") {
        cssValues.push(`blur(${(effect as BlurEffect).radius}px)`);
      }
    }

    const hasShadow = s.effects.some(e => e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW");
    const hasBlur = s.effects.some(e => e.type === "LAYER_BLUR" || e.type === "BACKGROUND_BLUR");

    let type = "mixed";
    if (hasShadow && !hasBlur) type = "shadow";
    if (hasBlur && !hasShadow) type = "blur";

    return {
      name: s.name,
      type,
      cssValue: cssValues.join(", "),
      description: s.description || "",
    };
  });
}

// ─── Grid Style Extraction ────────────────────────────────────────────────────

function extractGridStyles(): GridStyle[] {
  const styles = figma.getLocalGridStyles();
  const result: GridStyle[] = [];

  for (const s of styles) {
    for (const grid of s.grids) {
      if (grid.pattern !== "COLUMNS") continue;

      const g = grid as ColumnGridMixin["grids"][0] & {
        count: number;
        gutterSize: number;
        offset: number;
        sectionSize?: number;
        alignment: string;
      };

      result.push({
        name: s.name,
        columns: (g as any).count ?? 12,
        gutter: (g as any).gutterSize ?? 0,
        margin: (g as any).offset ?? 0,
        breakpoint: s.description || "",
      });
    }
  }

  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function extractAll(): Promise<ExtractedData> {
  const [variables, textStyles, effectStyles, gridStyles] = await Promise.all([
    extractVariables(),
    Promise.resolve(extractTextStyles()),
    Promise.resolve(extractEffectStyles()),
    Promise.resolve(extractGridStyles()),
  ]);

  return {
    fileName: figma.root.name,
    extractedAt: new Date().toISOString(),
    variables,
    textStyles,
    effectStyles,
    gridStyles,
  };
}

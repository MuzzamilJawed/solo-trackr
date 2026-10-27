// PSX's market summary appends corporate-action flags to a company's name:
// "Pak PetroleumXD" = ex-dividend today (XB bonus, XR rights, XW warrants).
// Strip them for display and for matching headlines to a company.
export const cleanPsxName = (name?: string): string | undefined =>
    name ? name.replace(/(?<=[a-z.)\s])(?:X[DBRW])+$/, "").trim() : name;

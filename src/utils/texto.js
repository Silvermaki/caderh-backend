// Texto comparable para cruzar nombres escritos a mano contra catálogos:
// minúsculas, sin tildes, sin signos ni espacios dobles.
//   "Francisco_Morazan" · "Francisco Morazán" · "FRANCISCO MORAZAN" → "francisco morazan"
export function plano(value) {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

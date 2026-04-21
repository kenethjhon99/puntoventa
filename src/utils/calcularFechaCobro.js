/**
 * Calcula la fecha de cobro estimada usando solo el tipo de pago real del
 * empleado. La tabla Empleado no define sueldo ni dia_pago; por eso usamos
 * reglas operativas fijas:
 *   - SEMANAL: siguiente viernes
 *   - MENSUAL: ultimo dia del mes
 */
export const calcularFechaCobro = (empleado, fechaBase = new Date()) => {
  if (!empleado || typeof empleado !== "object") {
    throw new Error("empleado invalido para calcular fecha de cobro");
  }

  const tipoPago = String(empleado.tipo_pago || "").toUpperCase();
  const base = new Date(fechaBase);
  base.setHours(0, 0, 0, 0);

  if (tipoPago === "SEMANAL") {
    const diaPagoIso = 5; // viernes
    const diaActualIso = base.getDay() === 0 ? 7 : base.getDay();
    const diff = (diaPagoIso - diaActualIso + 7) % 7;
    const offset = diff === 0 ? 7 : diff;
    const resultado = new Date(base);
    resultado.setDate(base.getDate() + offset);
    return resultado;
  }

  if (tipoPago === "MENSUAL") {
    const anio = base.getFullYear();
    const mes = base.getMonth();
    const hoy = base.getDate();
    const ultimoDelMes = (y, m) => new Date(y, m + 1, 0).getDate();
    const diaObjetivoEsteMes = ultimoDelMes(anio, mes);

    if (hoy >= diaObjetivoEsteMes) {
      return new Date(anio, mes + 1, ultimoDelMes(anio, mes + 1));
    }

    return new Date(anio, mes, diaObjetivoEsteMes);
  }

  throw new Error(`tipo_pago no soportado: ${tipoPago}`);
};

export const toIsoDate = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

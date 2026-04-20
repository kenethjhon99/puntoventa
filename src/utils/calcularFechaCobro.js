/**
 * Calcula la fecha de cobro estimada de un crédito a empleado,
 * segun su tipo_pago y dia_pago configurado.
 *
 * Semantica de dia_pago:
 *   tipo_pago = "SEMANAL"  -> dia_pago 1..7 (ISO: 1=lunes .. 7=domingo)
 *   tipo_pago = "MENSUAL"  -> dia_pago 1..28 (dia exacto) o 0 (ultimo dia del mes)
 *
 * Reglas:
 *   - Si hoy == dia objetivo, salta al siguiente ciclo (no se cobra el mismo dia
 *     en que se otorga el credito).
 *   - Para MENSUAL, si el dia objetivo ya paso en el mes en curso, se salta al
 *     mes siguiente. Dia 29-31 se clampan al ultimo dia real cuando corresponda.
 *
 * @param {{ tipo_pago: string, dia_pago: number }} empleado
 * @param {Date} [fechaBase] fecha de referencia (por defecto: now)
 * @returns {Date} fecha de cobro estimada (medianoche local)
 */
export const calcularFechaCobro = (empleado, fechaBase = new Date()) => {
  if (!empleado || typeof empleado !== "object") {
    throw new Error("empleado invalido para calcular fecha de cobro");
  }

  const tipoPago = String(empleado.tipo_pago || "").toUpperCase();
  const diaPago = Number(empleado.dia_pago);

  if (!Number.isInteger(diaPago)) {
    throw new Error("dia_pago del empleado invalido");
  }

  const base = new Date(fechaBase);
  base.setHours(0, 0, 0, 0);

  if (tipoPago === "SEMANAL") {
    if (diaPago < 1 || diaPago > 7) {
      throw new Error("dia_pago semanal debe estar entre 1 y 7");
    }

    // getDay(): 0=domingo, 1=lunes ... 6=sabado. ISO: 1=lunes ... 7=domingo.
    const diaActualIso = base.getDay() === 0 ? 7 : base.getDay();
    const diff = (diaPago - diaActualIso + 7) % 7;
    const offset = diff === 0 ? 7 : diff; // nunca el mismo dia
    const resultado = new Date(base);
    resultado.setDate(base.getDate() + offset);
    return resultado;
  }

  if (tipoPago === "MENSUAL") {
    if (diaPago < 0 || diaPago > 28) {
      throw new Error("dia_pago mensual debe estar entre 0 y 28");
    }

    const anio = base.getFullYear();
    const mes = base.getMonth();
    const hoy = base.getDate();

    const ultimoDelMes = (y, m) => new Date(y, m + 1, 0).getDate();

    const diaObjetivoEsteMes =
      diaPago === 0 ? ultimoDelMes(anio, mes) : diaPago;

    // si ya paso (o es hoy), saltar al proximo mes
    if (hoy >= diaObjetivoEsteMes) {
      const diaObjetivoProxMes =
        diaPago === 0 ? ultimoDelMes(anio, mes + 1) : diaPago;
      return new Date(anio, mes + 1, diaObjetivoProxMes);
    }

    return new Date(anio, mes, diaObjetivoEsteMes);
  }

  throw new Error(`tipo_pago no soportado: ${tipoPago}`);
};

/**
 * Formatea Date -> "YYYY-MM-DD" en hora local (sin zona).
 * Util para guardar como `date` en Postgres sin que UTC nos corra un dia.
 */
export const toIsoDate = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

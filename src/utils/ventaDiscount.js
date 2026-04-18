const round2 = (value) => Number((Number(value) || 0).toFixed(2));

export const normalizeDiscountPercentage = (value) => {
  if (value == null || value === "") return 0;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error("descuento_porcentaje debe ser un numero valido");
  }

  return round2(parsed);
};

export const calculateDiscountedSaleLine = ({
  salePrice,
  costPrice,
  quantity,
  discountPercentage,
}) => {
  const precioListaUnitario = round2(salePrice);
  const costoUnitario = round2(costPrice);
  const cantidad = Number(quantity) || 0;
  const porcentaje = normalizeDiscountPercentage(discountPercentage);

  const gananciaUnitaria = round2(
    Math.max(precioListaUnitario - costoUnitario, 0)
  );
  const descuentoPotencialUnitario = round2(
    gananciaUnitaria * (porcentaje / 100)
  );
  const precioFinalUnitario = round2(
    Math.max(costoUnitario, precioListaUnitario - descuentoPotencialUnitario)
  );
  const descuentoUnitario = round2(precioListaUnitario - precioFinalUnitario);
  const subtotal = round2(precioFinalUnitario * cantidad);
  const costoTotal = round2(costoUnitario * cantidad);
  const descuentoTotal = round2(descuentoUnitario * cantidad);
  const utilidad = round2(subtotal - costoTotal);

  return {
    precioListaUnitario,
    costoUnitario,
    descuentoPorcentaje: porcentaje,
    gananciaUnitaria,
    descuentoUnitario,
    precioFinalUnitario,
    subtotal,
    costoTotal,
    descuentoTotal,
    utilidad,
  };
};


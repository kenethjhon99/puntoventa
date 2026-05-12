import bcrypt from "bcrypt";

// Rounds de bcrypt. Configurable por env pero clampado a un minimo
// seguro: por debajo de 10 el hash es trivialmente cracleable, y por
// arriba de 14 el login se vuelve lento sin gran beneficio adicional.
const BCRYPT_ROUNDS = (() => {
  const raw = Number(process.env.BCRYPT_ROUNDS);
  if (!Number.isFinite(raw)) return 10;
  return Math.min(14, Math.max(10, Math.trunc(raw)));
})();

// Politica de password:
//   - minimo 8 caracteres
//   - al menos una letra y al menos un digito
//   - rechaza espacios al inicio o al final
//
// Es una linea de defensa moderada, no draconiana. Si en el futuro se
// quiere mas estricto (simbolos, mayuscula obligatoria, blocklist de
// passwords comunes), se centraliza aqui.
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 100;

export const isBcryptHash = (value) => {
  return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(String(value || ""));
};

export const validatePasswordPolicy = (password) => {
  if (typeof password !== "string") {
    const error = new Error("password requerido");
    error.statusCode = 400;
    throw error;
  }
  if (password !== password.trim()) {
    const error = new Error("La password no puede empezar ni terminar con espacios");
    error.statusCode = 400;
    throw error;
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    const error = new Error(
      `La password debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`
    );
    error.statusCode = 400;
    throw error;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    const error = new Error(
      `La password no puede tener mas de ${MAX_PASSWORD_LENGTH} caracteres`
    );
    error.statusCode = 400;
    throw error;
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    const error = new Error("La password debe incluir al menos una letra y un numero");
    error.statusCode = 400;
    throw error;
  }
};

// Hash + validacion de policy. Usar para signup y cambio de password.
export const hashPassword = async (password) => {
  validatePasswordPolicy(password);
  return bcrypt.hash(password, BCRYPT_ROUNDS);
};

// Hash sin validar policy. Usar SOLO para re-hash de passwords legacy
// que ya estaban aceptadas en la base de datos (texto plano antiguo).
// No exponer este path a input directo del usuario.
const rehashLegacyPassword = (password) => bcrypt.hash(password, BCRYPT_ROUNDS);

export const verifyPasswordWithUpgrade = async ({
  plainPassword,
  storedPasswordHash,
  onLegacyUpgrade,
}) => {
  if (!storedPasswordHash) return false;

  if (isBcryptHash(storedPasswordHash)) {
    return bcrypt.compare(plainPassword, storedPasswordHash);
  }

  if (plainPassword !== storedPasswordHash) {
    return false;
  }

  if (typeof onLegacyUpgrade === "function") {
    // El upgrade no debe validar policy: la password ya estaba
    // aceptada de antes, solo la estamos migrando a bcrypt.
    // Validar aqui rompria el login de usuarios viejos con passwords
    // que no cumplen la policy nueva.
    const upgradedHash = await rehashLegacyPassword(plainPassword);
    await onLegacyUpgrade(upgradedHash);
  }

  return true;
};

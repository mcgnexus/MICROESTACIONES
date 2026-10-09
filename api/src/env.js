// Clasificación del entorno de ejecución. En Vercel `NODE_ENV` puede no estar
// definido, pero `VERCEL_ENV` sí; ambos cuentan para decidir si estamos en
// producción, donde nunca se habilitan ayudas de depuración ni envíos simulados.

export function isProduction(env = process.env) {
  return (env.NODE_ENV || '').toLowerCase() === 'production'
    || (env.VERCEL_ENV || '').toLowerCase() === 'production';
}

// Los códigos/enlaces de depuración solo se exponen fuera de producción y con la
// variable explícitamente activada. Nunca en producción.
export function otpDebugEnabled(env = process.env) {
  return env.OTP_DEBUG === 'true' && !isProduction(env);
}

// El motor de avisos solo se presenta como tal cuando está comprobado en esa
// instalación. Mientras `ALERT_ENGINE_VERIFIED=false`, los avisos de umbral
// local no se muestran a los visitantes (administración sigue viéndolos para
// depurar). Se activa explícitamente tras validar el motor de extremo a extremo.
export function alertEngineVerified(env = process.env) {
  return String(env.ALERT_ENGINE_VERIFIED ?? 'true').toLowerCase() !== 'false';
}

// Fase de evaluación (fase 1): con `ALERT_SEND_ENABLED=false`, el motor abre y
// registra episodios visibles en la app pero NO encola envíos externos. Por
// defecto se permite el envío, así que no cambia el comportamiento habitual.
export function alertSendEnabled(env = process.env) {
  return String(env.ALERT_SEND_ENABLED ?? 'true').toLowerCase() !== 'false';
}

import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { ah, s } from "../utils.js";

const router = express.Router();
router.use(requireAuth);

/*
 * Catálogo CIE-10 embebido — los diagnósticos más frecuentes en consulta
 * externa (referencia: perfiles de morbilidad ambulatoria MSP Ecuador).
 * Funciona 100% offline. Búsqueda por código o descripción, sin acentos.
 */
const CIE10 = [
  // Respiratorio
  ["J00", "Rinofaringitis aguda (resfriado común)"],
  ["J01.9", "Sinusitis aguda, no especificada"],
  ["J02.9", "Faringitis aguda, no especificada"],
  ["J03.9", "Amigdalitis aguda, no especificada"],
  ["J04.0", "Laringitis aguda"],
  ["J06.9", "Infección aguda de las vías respiratorias superiores"],
  ["J11.1", "Influenza con otras manifestaciones respiratorias"],
  ["J18.9", "Neumonía, no especificada"],
  ["J20.9", "Bronquitis aguda, no especificada"],
  ["J21.9", "Bronquiolitis aguda, no especificada"],
  ["J30.4", "Rinitis alérgica, no especificada"],
  ["J40", "Bronquitis, no especificada como aguda o crónica"],
  ["J44.9", "Enfermedad pulmonar obstructiva crónica (EPOC)"],
  ["J45.9", "Asma, no especificada"],
  // Digestivo
  ["A08.4", "Infección intestinal viral, sin otra especificación"],
  ["A09", "Diarrea y gastroenteritis de presunto origen infeccioso"],
  ["B82.9", "Parasitosis intestinal, sin otra especificación"],
  ["K02.9", "Caries dental, no especificada"],
  ["K21.0", "Enfermedad del reflujo gastroesofágico con esofagitis"],
  ["K21.9", "Enfermedad del reflujo gastroesofágico sin esofagitis"],
  ["K25.9", "Úlcera gástrica, no especificada"],
  ["K29.7", "Gastritis, no especificada"],
  ["K30", "Dispepsia funcional"],
  ["K35.8", "Apendicitis aguda, otras y no especificada"],
  ["K52.9", "Colitis y gastroenteritis no infecciosas"],
  ["K58.9", "Síndrome del colon irritable sin diarrea"],
  ["K59.0", "Estreñimiento"],
  ["K64.9", "Hemorroides, no especificadas"],
  ["K80.2", "Cálculo de la vesícula biliar sin colecistitis"],
  ["R10.4", "Otros dolores abdominales y los no especificados"],
  ["R11", "Náusea y vómito"],
  // Cardiovascular / metabólico
  ["E03.9", "Hipotiroidismo, no especificado"],
  ["E04.9", "Bocio no tóxico, no especificado"],
  ["E11.9", "Diabetes mellitus tipo 2, sin complicaciones"],
  ["E11.2", "Diabetes mellitus tipo 2 con complicaciones renales"],
  ["E14.9", "Diabetes mellitus, no especificada"],
  ["E28.2", "Síndrome de ovario poliquístico"],
  ["E55.9", "Deficiencia de vitamina D, no especificada"],
  ["E66.9", "Obesidad, no especificada"],
  ["E78.0", "Hipercolesterolemia pura"],
  ["E78.2", "Hiperlipidemia mixta"],
  ["E78.5", "Hiperlipidemia, no especificada"],
  ["E86", "Depleción del volumen (deshidratación)"],
  ["I10", "Hipertensión esencial (primaria)"],
  ["I20.9", "Angina de pecho, no especificada"],
  ["I25.9", "Enfermedad isquémica crónica del corazón"],
  ["I48", "Fibrilación y aleteo auricular"],
  ["I50.9", "Insuficiencia cardíaca, no especificada"],
  ["I83.9", "Venas varicosas de los miembros inferiores"],
  ["I84.9", "Hemorroides no especificadas, sin complicación"],
  ["R03.0", "Lectura elevada de la presión sanguínea sin diagnóstico"],
  // Genitourinario
  ["N30.0", "Cistitis aguda"],
  ["N39.0", "Infección de vías urinarias, sitio no especificado"],
  ["N40", "Hiperplasia de la próstata"],
  ["N76.0", "Vaginitis aguda"],
  ["N92.6", "Menstruación irregular, no especificada"],
  ["N94.6", "Dismenorrea, no especificada"],
  ["N95.1", "Estados menopáusicos y climatéricos femeninos"],
  ["N20.0", "Cálculo del riñón"],
  ["N18.9", "Enfermedad renal crónica, no especificada"],
  // Embarazo
  ["Z32.1", "Embarazo confirmado"],
  ["Z34.9", "Supervisión de embarazo normal, no especificado"],
  ["O21.0", "Hiperémesis gravídica leve"],
  ["O23.4", "Infección de vías urinarias en el embarazo"],
  ["O99.0", "Anemia que complica el embarazo"],
  // Musculoesquelético
  ["M15.9", "Poliartrosis, no especificada"],
  ["M17.9", "Gonartrosis, no especificada"],
  ["M19.9", "Artrosis, no especificada"],
  ["M25.5", "Dolor en articulación"],
  ["M54.2", "Cervicalgia"],
  ["M54.4", "Lumbago con ciática"],
  ["M54.5", "Lumbago no especificado"],
  ["M62.6", "Distensión muscular"],
  ["M65.9", "Sinovitis y tenosinovitis, no especificada"],
  ["M75.1", "Síndrome del manguito rotador"],
  ["M77.1", "Epicondilitis lateral"],
  ["M79.1", "Mialgia"],
  ["M79.6", "Dolor en miembro"],
  ["M10.9", "Gota, no especificada"],
  ["M81.9", "Osteoporosis, no especificada"],
  // Neurológico / salud mental
  ["F32.9", "Episodio depresivo, no especificado"],
  ["F41.1", "Trastorno de ansiedad generalizada"],
  ["F41.9", "Trastorno de ansiedad, no especificado"],
  ["F51.0", "Insomnio no orgánico"],
  ["G40.9", "Epilepsia, no especificada"],
  ["G43.9", "Migraña, no especificada"],
  ["G44.2", "Cefalea tensional"],
  ["R42", "Mareo y desvanecimiento (vértigo)"],
  ["R51", "Cefalea"],
  ["G47.0", "Trastornos del inicio y mantenimiento del sueño"],
  // Piel
  ["B01.9", "Varicela sin complicaciones"],
  ["B02.9", "Herpes zóster sin complicaciones"],
  ["B35.9", "Dermatofitosis (tiña), no especificada"],
  ["B36.0", "Pitiriasis versicolor"],
  ["B86", "Escabiosis"],
  ["L02.9", "Absceso cutáneo, furúnculo y ántrax"],
  ["L03.9", "Celulitis, no especificada"],
  ["L20.9", "Dermatitis atópica, no especificada"],
  ["L23.9", "Dermatitis alérgica de contacto"],
  ["L29.9", "Prurito, no especificado"],
  ["L50.9", "Urticaria, no especificada"],
  ["L70.0", "Acné vulgar"],
  // Ojos / oídos
  ["H10.9", "Conjuntivitis, no especificada"],
  ["H60.9", "Otitis externa, no especificada"],
  ["H66.9", "Otitis media, no especificada"],
  ["H61.2", "Cerumen impactado"],
  ["H52.4", "Presbicia"],
  ["H81.1", "Vértigo paroxístico benigno"],
  // Infecciosas / generales
  ["A90", "Fiebre del dengue (dengue clásico)"],
  ["B34.9", "Infección viral, no especificada"],
  ["B37.9", "Candidiasis, no especificada"],
  ["D50.9", "Anemia por deficiencia de hierro, no especificada"],
  ["D64.9", "Anemia, no especificada"],
  ["R05", "Tos"],
  ["R50.9", "Fiebre, no especificada"],
  ["R53", "Malestar y fatiga"],
  ["T78.4", "Alergia, no especificada"],
  ["U07.1", "COVID-19, virus identificado"],
  // Traumatismos frecuentes
  ["S61.9", "Herida de la muñeca y de la mano"],
  ["S93.4", "Esguince y torcedura del tobillo"],
  ["S83.6", "Esguince de la rodilla"],
  ["T14.0", "Traumatismo superficial de región no especificada"],
  ["T14.1", "Herida de región corporal no especificada"],
  ["W54", "Mordedura o ataque de perro"],
  // Controles / prevención
  ["Z00.0", "Examen médico general"],
  ["Z00.1", "Control de salud de rutina del niño"],
  ["Z01.4", "Examen ginecológico (general y de rutina)"],
  ["Z23.8", "Necesidad de inmunización (vacunación)"],
  ["Z30.9", "Atención anticonceptiva, no especificada"],
  ["Z71.3", "Consulta para instrucción y vigilancia de la dieta"],
  ["Z76.0", "Consulta para repetición de receta"],
];

const norm = (t) => String(t).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const INDEX = CIE10.map(([code, desc]) => ({ code, desc, key: norm(`${code} ${desc}`) }));

// GET /api/icd10?q=faringitis  → top 20 coincidencias
router.get("/", ah(async (req, res) => {
  const query = norm(s(req.query.q, 80) || "");
  if (!query || query.length < 2) return res.json([]);
  const terms = query.split(/\s+/).filter(Boolean);
  const out = INDEX.filter((e) => terms.every((t) => e.key.includes(t)))
    .slice(0, 20)
    .map(({ code, desc }) => ({ code, desc }));
  res.json(out);
}));

export default router;

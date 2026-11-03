/**
 * "JEV simulado" por regra sobre as MESMAS características que o JEV recebe, no formato real da API.
 * Não mede a qualidade do JEV: prova o pipeline (cliente → proxy → resposta → decisão) e que as
 * características enviadas SEPARAM as formas (se uma regra simples acerta, um modelo treinado também deve).
 */
export function fakeJev(state: any) {
  const f = state.stroke;
  let shape = 'none';
  if (f.closed || f.gap_ratio < 0.2) {
    if (f.corner_count === 4 && f.bbox_fill > 0.75) shape = 'rectangle';
    else if (f.corner_count === 3 && f.bend_count === 3 && f.bbox_fill > 0.35 && f.bbox_fill < 0.65) shape = 'triangle';
    else if (Math.max(0, ...f.turning_angles_deg) < 85 && f.bbox_fill > 0.68 && f.bbox_fill < 0.86 && f.self_intersections <= 1) shape = 'circle';
  }
  const probabilities = Object.fromEntries(['circle', 'triangle', 'rectangle', 'none'].map((k) => [k, k === shape ? 0.9 : 0.1 / 3]));
  return { model: 'fake', answers: { shape: { type: 'choice', choice: shape, confidence: 0.85, probabilities }, deliberate: { type: 'noul', noul: shape === 'none' ? 0.2 : 0.9 } }, usage: { input_tokens: 400 } };
}


/** fetch simulado: responde como a API do JEV, calculando a resposta com `fakeJev`. */
export const fakeFetch = (async (_url: string, init: any) =>
  new Response(JSON.stringify(fakeJev(JSON.parse(init.body).state)), { status: 200 })) as unknown as typeof fetch;

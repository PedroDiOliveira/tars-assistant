import { GOAL_LABELS } from "./training-profile";
import { MAJOR_GROUPS, formatFrequency, splitFrequency, weeklySets, type PlanChoices, type PlanSkeleton } from "./training-rules";
import { resolveSplit } from "./training-splits";
import type { TrainingProfile } from "./types";

/**
 * Base científica do plano: uma lista FIXA de princípios, cada um com a sua referência. Nem a IA nem a tela escrevem
 * ciência: as regras escolhem quais princípios valem para estas respostas e montam frases simples a partir daqui. A IA
 * (nos ajustes) só pode apontar um destes ids, nunca citar um estudo por conta própria.
 *
 * ⚠️ Antes de publicar para outras pessoas, um profissional de educação física revisa as frases e as referências
 * (mesma revisão da lista de cautela por região). Referências conferidas em 08/11/2026.
 */

export interface Reference {
  /** "Schoenfeld, Ogborn e Krieger (2017)" */
  short: string;
  /** citação completa, no estilo Vancouver simplificado */
  full: string;
  doi: string;
}

export type PrincipleId = "volume" | "frequencia" | "carga" | "ordem" | "descanso" | "falha" | "variacao" | "progressao";

export const PRINCIPLE_IDS: readonly PrincipleId[] = ["volume", "frequencia", "carga", "ordem", "descanso", "falha", "variacao", "progressao"];

export interface Principle {
  id: PrincipleId;
  /** nome curto, para quem lê ("Volume da semana") */
  title: string;
  reference: Reference;
}

export const PRINCIPLES: Record<PrincipleId, Principle> = {
  volume: {
    id: "volume",
    title: "Volume da semana",
    reference: {
      short: "Schoenfeld, Ogborn e Krieger (2017)",
      full: "Schoenfeld BJ, Ogborn D, Krieger JW. Dose-response relationship between weekly resistance training volume and increases in muscle mass: a systematic review and meta-analysis. J Sports Sci. 2017;35(11):1073-1082.",
      doi: "10.1080/02640414.2016.1210197",
    },
  },
  frequencia: {
    id: "frequencia",
    title: "Frequência",
    reference: {
      short: "Schoenfeld, Grgic e Krieger (2019)",
      full: "Schoenfeld BJ, Grgic J, Krieger J. How many times per week should a muscle be trained to maximize muscle hypertrophy? A systematic review and meta-analysis of studies examining the effects of resistance training frequency. J Sports Sci. 2019;37(11):1286-1295.",
      doi: "10.1080/02640414.2018.1555906",
    },
  },
  carga: {
    id: "carga",
    title: "Carga e repetições",
    reference: {
      short: "Schoenfeld et al. (2017)",
      full: "Schoenfeld BJ, Grgic J, Ogborn D, Krieger JW. Strength and hypertrophy adaptations between low- vs. high-load resistance training: a systematic review and meta-analysis. J Strength Cond Res. 2017;31(12):3508-3523.",
      doi: "10.1519/JSC.0000000000002200",
    },
  },
  ordem: {
    id: "ordem",
    title: "Ordem dos exercícios",
    reference: {
      short: "Simão et al. (2012)",
      full: "Simão R, de Salles BF, Figueiredo T, Dias I, Willardson JM. Exercise order in resistance training. Sports Med. 2012;42(3):251-265.",
      doi: "10.2165/11597240-000000000-00000",
    },
  },
  descanso: {
    id: "descanso",
    title: "Descanso entre séries",
    reference: {
      short: "Schoenfeld et al. (2016)",
      full: "Schoenfeld BJ, Pope ZK, Benik FM, et al. Longer interset rest periods enhance muscle strength and hypertrophy in resistance-trained men. J Strength Cond Res. 2016;30(7):1805-1812.",
      doi: "10.1519/JSC.0000000000001272",
    },
  },
  falha: {
    id: "falha",
    title: "Perto do cansaço, sem ir à falha",
    reference: {
      short: "Refalo et al. (2023)",
      full: "Refalo MC, Helms ER, Trexler ET, Hamilton DL, Fyfe JJ. Influence of resistance training proximity-to-failure on skeletal muscle hypertrophy: a systematic review with meta-analysis. Sports Med. 2023;53(3):649-665.",
      doi: "10.1007/s40279-022-01784-y",
    },
  },
  variacao: {
    id: "variacao",
    title: "Variar sem exagero",
    reference: {
      short: "Kassiano et al. (2022)",
      full: "Kassiano W, Nunes JP, Costa B, Ribeiro AS, Schoenfeld BJ, Cyrino ES. Does varying resistance exercises promote superior muscle hypertrophy and strength gains? A systematic review. J Strength Cond Res. 2022;36(6):1753-1762.",
      doi: "10.1519/JSC.0000000000004258",
    },
  },
  progressao: {
    id: "progressao",
    title: "Progressão",
    reference: {
      short: "ACSM (2009)",
      full: "American College of Sports Medicine. American College of Sports Medicine position stand. Progression models in resistance training for healthy adults. Med Sci Sports Exerc. 2009;41(3):687-708.",
      doi: "10.1249/MSS.0b013e3181915670",
    },
  },
};

export interface SciencePoint {
  principle: PrincipleId;
  title: string;
  /** uma ou duas frases simples, ligadas às respostas da pessoa */
  text: string;
}

export interface ScienceSummary {
  points: SciencePoint[];
  /** as referências dos pontos, sem repetir, na ordem em que aparecem */
  references: Reference[];
}

const WHO: Record<TrainingProfile["experience"], string> = {
  iniciante: "está começando",
  intermediario: "já treina",
  avancado: "treina há bastante tempo",
};

/** Faixa de séries semanais dos grupos grandes com estas escolhas, arredondada ("10 a 14"). */
function weeklyRange(skeleton: PlanSkeleton, choices: PlanChoices): [number, number] | null {
  const totals = weeklySets(skeleton, choices);
  const values = MAJOR_GROUPS.map((g) => totals[g] ?? 0).filter((n) => n > 0).map(Math.round);
  return values.length ? [Math.min(...values), Math.max(...values)] : null;
}

/** Faixa de repetições do plano inteiro ("6 a 15"). */
function repRange(skeleton: PlanSkeleton, choices: PlanChoices): [number, number] {
  const reps = skeleton.days.flatMap((d) => d.slots.map((s) => choices[s.id]?.reps ?? s.reps));
  return [Math.min(...reps.map((r) => r[0])), Math.max(...reps.map((r) => r[1]))];
}

/**
 * "Por que este treino funciona": de 4 a 5 princípios que combinam com as respostas e com o plano como ele está agora
 * (as séries e repetições que a pessoa ajustou entram na conta). Sempre: volume, frequência, carga e ordem. O quinto
 * depende do objetivo: descanso para massa e força; não precisar ir à falha para os demais.
 */
export function scienceSummary(profile: TrainingProfile, skeleton: PlanSkeleton, choices: PlanChoices): ScienceSummary {
  const points: SciencePoint[] = [];
  const range = weeklyRange(skeleton, choices);

  if (range) {
    const sets = range[0] === range[1] ? `${range[0]}` : `${range[0]} a ${range[1]}`;
    points.push({
      principle: "volume",
      title: PRINCIPLES.volume.title,
      text: `Cada grupo grande soma ${sets} séries por semana. Os estudos que comparam quantidades de séries mostram que mais séries na semana tendem a dar mais resultado, até um limite; essa faixa é um bom ponto de partida para quem ${WHO[profile.experience]}.`,
    });
  }

  const days = skeleton.daysPerWeek ?? profile.daysPerWeek;
  const frequency = formatFrequency(splitFrequency(resolveSplit({ ...profile, daysPerWeek: days as TrainingProfile["daysPerWeek"] }, skeleton.option), days));
  points.push({
    principle: "frequencia",
    title: PRINCIPLES.frequencia.title,
    text: `Nos seus ${days} dias, cada músculo treina ${frequency} por semana. Com o mesmo volume na semana, treinar um músculo 1, 2 ou 3 vezes dá resultados parecidos: o melhor é a divisão que cabe na sua rotina.`,
  });

  const [low, high] = repRange(skeleton, choices);
  points.push({
    principle: "carga",
    title: PRINCIPLES.carga.title,
    text:
      profile.goal === "forca"
        ? `Os exercícios principais ficam em poucas repetições: para ganhar força, carga alta rende mais que carga leve. Os de apoio vão até ${high} repetições para somar volume sem castigar as articulações.`
        : `As repetições ficam entre ${low} e ${high}. Para ${GOAL_LABELS[profile.goal].label.toLowerCase()}, cargas leves e pesadas funcionam parecido quando a série termina perto do cansaço; variar a faixa deixa o treino mais confortável.`,
  });

  points.push({
    principle: "ordem",
    title: PRINCIPLES.ordem.title,
    text: "Os exercícios mais pesados vêm primeiro: o que é feito no começo do treino rende mais repetições e carga. Se mudar a ordem, deixe no começo o que mais importa para você.",
  });

  if (profile.goal === "massa" || profile.goal === "forca") {
    points.push({
      principle: "descanso",
      title: PRINCIPLES.descanso.title,
      text: "Os principais têm descanso de 2 minutos ou mais: com pausas mais longas, a carga se mantém de uma série para a outra e o treino rende mais.",
    });
  } else {
    points.push({
      principle: "falha",
      title: PRINCIPLES.falha.title,
      text: "Não precisa ir até não aguentar em toda série: parar com 1 a 3 repetições sobrando dá resultado parecido, com menos cansaço e menos risco.",
    });
  }

  const references: Reference[] = [];
  for (const point of points) {
    const ref = PRINCIPLES[point.principle].reference;
    if (!references.includes(ref)) references.push(ref);
  }
  return { points, references };
}

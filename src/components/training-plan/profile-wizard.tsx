"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, ShieldCheck, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SubHeader } from "@/components/layout/sub-header";
import { withStoreGate } from "@/components/layout/store-gate";
import { notify } from "@/components/shared/notify";
import { ProgressBar } from "@/components/shared/progress-bar";
import {
  BODY_REGIONS,
  EXPERIENCE_LABELS,
  GOAL_LABELS,
  LOCATION_LABELS,
  MAX_PRIORITIES,
  MAX_PROFILE_NOTES,
  PRIORITY_GROUPS,
  PRIORITY_LABELS,
  REGION_LABELS,
  SCREENING_QUESTIONS,
  SESSION_MINUTES,
  TRAINING_DAYS,
  TRAINING_EXPERIENCES,
  TRAINING_GOALS,
  TRAINING_LOCATIONS,
} from "@/domain/training-profile";
import type { BodyRegion, HealthScreening, PriorityGroup, TrainingProfile } from "@/domain/types";
import { useActions, useData } from "@/data";
import { cn } from "cn";
import { generateProposal } from "./generate";

type Answers = Omit<TrainingProfile, "updatedAt">;
type Step = "goal" | "experience" | "days" | "minutes" | "location" | "health" | "limitations" | "screening" | "priorities" | "notes";

const ALL_STEPS: readonly Step[] = ["goal", "experience", "days", "minutes", "location", "health", "limitations", "screening", "priorities", "notes"];
const HEALTH_STEPS: ReadonlySet<Step> = new Set(["limitations", "screening"]);

function Option({ selected, onClick, label, hint }: { selected: boolean; onClick: () => void; label: string; hint?: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex min-h-16 w-full items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-left transition active:scale-[0.99] active:bg-m-soft",
        selected && "border-m bg-m-soft",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{label}</span>
        {hint ? <span className="block text-sm text-muted-foreground">{hint}</span> : null}
      </span>
      {selected ? <Check className="size-5 shrink-0 text-m-ink" aria-hidden /> : null}
    </button>
  );
}

function Chip({ selected, onClick, children, label }: { selected: boolean; onClick: () => void; children: ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "min-h-12 rounded-2xl border bg-card px-4 text-base font-semibold tabular-nums transition active:scale-[0.98]",
        selected && "border-m bg-m-soft text-m-ink",
      )}
    >
      {children}
    </button>
  );
}

/**
 * As perguntas do plano de treino: uma por tela, quase tudo por toque. A parte de saúde só aparece depois do
 * consentimento (dado sensível, LGPD art. 11) e pode ser pulada; da triagem, só o RESULTADO é guardado.
 */
function ProfileWizardContent() {
  const data = useData();
  const router = useRouter();
  const { saveTrainingProfile } = useActions();
  const saved = data.trainingProfile;

  const [answers, setAnswers] = useState<Partial<Answers>>(() =>
    saved
      ? {
          goal: saved.goal,
          experience: saved.experience,
          daysPerWeek: saved.daysPerWeek,
          sessionMinutes: saved.sessionMinutes,
          location: saved.location,
          priorities: saved.priorities,
          notes: saved.notes,
          limitations: saved.limitations,
        }
      : { priorities: [], limitations: [] },
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [skipHealth, setSkipHealth] = useState(false);
  const [screening, setScreening] = useState<(boolean | null)[]>(() => SCREENING_QUESTIONS.map(() => null));
  const [flagged, setFlagged] = useState(false);
  const [saving, setSaving] = useState(false);

  // O Next mantém a rota escondida (Activity) em vez de desmontar: sair no meio e voltar retoma de onde parou, mas
  // depois de CONCLUIR (ou de "voltar depois") a próxima visita começa da primeira pergunta. A limpeza roda quando a
  // tela é escondida, então não pisca a primeira pergunta antes de trocar de tela.
  const finished = useRef(false);
  useLayoutEffect(
    () => () => {
      if (!finished.current) return;
      finished.current = false;
      setStepIndex(0);
      setFlagged(false);
      setScreening(SCREENING_QUESTIONS.map(() => null));
    },
    [],
  );

  const steps = ALL_STEPS.filter((s) => !(skipHealth && HEALTH_STEPS.has(s)));
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const next = () => setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  const back = () => {
    if (step === "screening" && flagged) {
      setFlagged(false);
      return;
    }
    setStepIndex((i) => Math.max(i - 1, 0));
  };
  const choose = <K extends keyof Answers>(key: K, value: Answers[K]) => {
    setAnswers((a) => ({ ...a, [key]: value }));
    next();
  };

  function toggleRegion(region: BodyRegion) {
    setAnswers((a) => {
      const current = a.limitations ?? [];
      return { ...a, limitations: current.includes(region) ? current.filter((r) => r !== region) : [...current, region] };
    });
  }

  function togglePriority(group: PriorityGroup) {
    setAnswers((a) => {
      const current = a.priorities ?? [];
      if (current.includes(group)) return { ...a, priorities: current.filter((g) => g !== group) };
      return current.length >= MAX_PRIORITIES ? a : { ...a, priorities: [...current, group] };
    });
  }

  function finishScreening() {
    if (screening.some((answer) => answer === true)) {
      setFlagged(true);
      return;
    }
    setAnswers((a) => ({ ...a, screening: "liberado" }));
    next();
  }

  async function submit() {
    const { goal, experience, daysPerWeek, sessionMinutes, location } = answers;
    if (!goal || !experience || !daysPerWeek || !sessionMinutes || !location) return;
    const health: { screening: HealthScreening; healthConsentAt?: number; limitations: BodyRegion[] } = skipHealth
      ? { screening: "nao-respondida", limitations: [] }
      : { screening: answers.screening ?? "liberado", healthConsentAt: answers.healthConsentAt, limitations: answers.limitations ?? [] };
    setSaving(true);
    const result = await saveTrainingProfile({
      goal,
      experience,
      daysPerWeek,
      sessionMinutes,
      location,
      priorities: answers.priorities ?? [],
      ...(answers.notes?.trim() ? { notes: answers.notes } : {}),
      ...health,
    });
    setSaving(false);
    if (!notify(result)) return;
    finished.current = true;
    router.replace("/treino/plano");
    void generateProposal();
  }

  const position = stepIndex + 1;

  return (
    <div data-module="workout" className="pb-10">
      <SubHeader title="Montar meu plano" backHref="/treino/plano" backLabel="Sair das perguntas" />
      <div className="space-y-6 px-4 pt-2">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Pergunta {position} de {steps.length}
          </p>
          <ProgressBar ratio={position / steps.length} label={`Pergunta ${position} de ${steps.length}`} />
        </div>

        {step === "goal" ? (
          <Question title="Qual é o seu objetivo principal?">
            {TRAINING_GOALS.map((goal) => (
              <Option key={goal} selected={answers.goal === goal} onClick={() => choose("goal", goal)} {...GOAL_LABELS[goal]} />
            ))}
          </Question>
        ) : null}

        {step === "experience" ? (
          <Question title="Há quanto tempo você treina?">
            {TRAINING_EXPERIENCES.map((level) => (
              <Option key={level} selected={answers.experience === level} onClick={() => choose("experience", level)} {...EXPERIENCE_LABELS[level]} />
            ))}
          </Question>
        ) : null}

        {step === "days" ? (
          <Question
            title="Quantos dias por semana você consegue treinar?"
            hint="Conte só os dias de musculação. Não precisa ser um treino diferente por dia: com 5 dias, por exemplo, sugerimos 3 treinos que se revezam. Você vê e muda isso no rascunho."
          >
            <div className="grid grid-cols-5 gap-2">
              {TRAINING_DAYS.map((days) => (
                <Chip key={days} selected={answers.daysPerWeek === days} onClick={() => choose("daysPerWeek", days)} label={`${days} dias`}>
                  {days}
                </Chip>
              ))}
            </div>
          </Question>
        ) : null}

        {step === "minutes" ? (
          <Question title="Quanto tempo você tem por treino?" hint="Incluindo uns 5 minutos de aquecimento.">
            <div className="grid grid-cols-2 gap-2">
              {SESSION_MINUTES.map((minutes) => (
                <Chip key={minutes} selected={answers.sessionMinutes === minutes} onClick={() => choose("sessionMinutes", minutes)}>
                  {minutes === 75 ? "75 min ou mais" : `${minutes} min`}
                </Chip>
              ))}
            </div>
          </Question>
        ) : null}

        {step === "location" ? (
          <Question title="Onde você treina?">
            {TRAINING_LOCATIONS.map((location) => (
              <Option key={location} selected={answers.location === location} onClick={() => choose("location", location)} {...LOCATION_LABELS[location]} />
            ))}
          </Question>
        ) : null}

        {step === "health" ? (
          <Question title="Agora, duas perguntas sobre saúde" hint="São opcionais, e deixam o plano mais seguro.">
            <div className="space-y-3 rounded-2xl border bg-card p-4 text-sm">
              <p className="flex items-start gap-2 font-medium">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-m-ink" aria-hidden />
                Dores e lesões são dados de saúde. Para usá-los, o app precisa do seu consentimento.
              </p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Servem só para tirar do plano os exercícios que costumam forçar a região.</li>
                <li>Das perguntas de prontidão, o app guarda só o resultado, nunca as respostas.</li>
                <li>As regiões marcadas vão para a IA que monta o plano, sem seu nome nem e-mail.</li>
                <li>Você pode apagar a qualquer momento refazendo as perguntas e pulando esta parte.</li>
              </ul>
            </div>
            <Button
              size="lg"
              className="w-full"
              onClick={() => {
                setSkipHealth(false);
                setAnswers((a) => ({ ...a, healthConsentAt: Date.now() }));
                next();
              }}
            >
              Concordo, quero responder
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setSkipHealth(true);
                setAnswers((a) => ({ ...a, limitations: [], healthConsentAt: undefined, screening: "nao-respondida" }));
                // Pula limitações e triagem: a próxima é a de prioridades.
                setStepIndex(ALL_STEPS.indexOf("health") + 1);
              }}
            >
              Pular esta parte
            </Button>
          </Question>
        ) : null}

        {step === "limitations" ? (
          <Question title="Tem alguma dor ou limitação hoje?" hint="Marque as regiões. Os exercícios que costumam forçá-las ficam de fora.">
            <div className="grid grid-cols-2 gap-2">
              {BODY_REGIONS.map((region) => (
                <Chip key={region} selected={(answers.limitations ?? []).includes(region)} onClick={() => toggleRegion(region)}>
                  {REGION_LABELS[region]}
                </Chip>
              ))}
            </div>
            <Button size="lg" className="w-full" onClick={next}>
              {(answers.limitations ?? []).length > 0 ? "Continuar" : "Nenhuma, continuar"}
            </Button>
          </Question>
        ) : null}

        {step === "screening" && !flagged ? (
          <Question title="Antes de começar" hint="Responda com sinceridade: é para a sua segurança.">
            <div className="space-y-3">
              {SCREENING_QUESTIONS.map((question, i) => (
                <div key={question} className="rounded-2xl border bg-card p-4">
                  <p className="text-sm font-medium" id={`screening-${i}`}>
                    {question}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-labelledby={`screening-${i}`}>
                    {[false, true].map((value) => (
                      <Chip
                        key={String(value)}
                        selected={screening[i] === value}
                        onClick={() => setScreening((list) => list.map((answer, j) => (j === i ? value : answer)))}
                      >
                        {value ? "Sim" : "Não"}
                      </Chip>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <Button size="lg" className="w-full" disabled={screening.some((answer) => answer === null)} onClick={finishScreening}>
              Continuar
            </Button>
          </Question>
        ) : null}

        {step === "screening" && flagged ? (
          <Question title="Converse com um médico antes">
            <div className="space-y-2 rounded-2xl border bg-card p-4 text-sm">
              <p className="flex items-start gap-2 font-medium">
                <Stethoscope className="mt-0.5 size-4 shrink-0 text-m-ink" aria-hidden />
                Pelas suas respostas, o recomendado é ter liberação médica antes de começar um plano novo.
              </p>
              <p className="text-muted-foreground">O app não guarda o que você respondeu, só que recomendou a liberação.</p>
            </div>
            <Button
              size="lg"
              className="w-full"
              onClick={() => {
                setAnswers((a) => ({ ...a, screening: "liberacao-medica" }));
                setFlagged(false);
                next();
              }}
            >
              Já tenho liberação médica
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="w-full"
              onClick={() => {
                finished.current = true;
                router.push("/treino");
              }}
            >
              Voltar depois
            </Button>
          </Question>
        ) : null}

        {step === "priorities" ? (
          <Question title="Quer dar mais atenção a algum grupo?" hint={`Opcional, até ${MAX_PRIORITIES}. Esses grupos ganham uma série a mais.`}>
            <div className="grid grid-cols-2 gap-2">
              {PRIORITY_GROUPS.map((group) => {
                const selected = (answers.priorities ?? []).includes(group);
                const full = !selected && (answers.priorities ?? []).length >= MAX_PRIORITIES;
                return (
                  <Chip key={group} selected={selected} onClick={() => togglePriority(group)} label={full ? `${PRIORITY_LABELS[group]} (limite de ${MAX_PRIORITIES})` : undefined}>
                    <span className={cn(full && "opacity-50")}>{PRIORITY_LABELS[group]}</span>
                  </Chip>
                );
              })}
            </div>
            <Button size="lg" className="w-full" onClick={next}>
              {(answers.priorities ?? []).length > 0 ? "Continuar" : "Sem prioridade, continuar"}
            </Button>
          </Question>
        ) : null}

        {step === "notes" ? (
          <Question title="Algo mais?" hint="Opcional. Por exemplo: “não gosto de agachamento livre” ou “treino de manhã”. Não escreva informações médicas aqui.">
            <div className="space-y-1">
              <Textarea
                aria-label="Algo mais"
                value={answers.notes ?? ""}
                maxLength={MAX_PROFILE_NOTES}
                rows={4}
                onChange={(e) => setAnswers((a) => ({ ...a, notes: e.target.value }))}
              />
              <p className="text-right text-xs text-muted-foreground tabular-nums">
                {(answers.notes ?? "").length}/{MAX_PROFILE_NOTES}
              </p>
            </div>
            <Button size="lg" className="w-full" disabled={saving} onClick={() => void submit()}>
              {saving ? "Salvando…" : "Gerar meu plano"}
            </Button>
          </Question>
        ) : null}

        {stepIndex > 0 ? (
          <Button variant="ghost" className="w-full" onClick={back}>
            Voltar à pergunta anterior
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Question({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-4" aria-labelledby="plan-question">
      <div className="space-y-1">
        <h2 id="plan-question" className="text-xl font-semibold tracking-tight">
          {title}
        </h2>
        {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export const ProfileWizard = withStoreGate(ProfileWizardContent);

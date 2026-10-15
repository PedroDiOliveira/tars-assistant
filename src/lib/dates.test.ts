import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  clockFromInstant,
  dateKeyFromInstant,
  instantFromLocal,
  daysBetween,
  daysLeftInWeek,
  isValidDateKey,
  monthEnd,
  weekEnd,
  weekStart,
  weekdayIndex,
} from "./dates";

describe("semana começa na segunda", () => {
  it("2026-10-06 é terça: a semana vai de 05/10 a 11/10", () => {
    expect(weekdayIndex("2026-10-06")).toBe(1);
    expect(weekStart("2026-10-06")).toBe("2026-10-05");
    expect(weekEnd("2026-10-06")).toBe("2026-10-11");
  });

  it("domingo ainda pertence à semana que começou na segunda anterior", () => {
    expect(weekStart("2026-10-11")).toBe("2026-10-05");
    expect(weekStart("2026-10-12")).toBe("2026-10-12");
  });

  it("virada de semana atravessando mês e ano", () => {
    expect(weekStart("2026-01-01")).toBe("2025-12-29");
    expect(weekEnd("2026-03-02")).toBe("2026-03-08");
  });

  it("dias restantes contam hoje: segunda = 7, domingo = 1", () => {
    expect(daysLeftInWeek("2026-10-05")).toBe(7);
    expect(daysLeftInWeek("2026-10-11")).toBe(1);
  });
});

describe("fuso America/Sao_Paulo", () => {
  it("23:30 em São Paulo ainda é o dia anterior em UTC", () => {
    // 2026-10-07T02:30Z = 2026-10-06 23:30 (UTC-3)
    expect(dateKeyFromInstant(Date.UTC(2026, 9, 7, 2, 30))).toBe("2026-10-06");
  });

  it("00:30 em São Paulo já é o dia seguinte", () => {
    // 2026-10-07T03:30Z = 2026-10-07 00:30 (UTC-3)
    expect(dateKeyFromInstant(Date.UTC(2026, 9, 7, 3, 30))).toBe("2026-10-07");
  });

  it("virada de mês e de ano respeitam o fuso", () => {
    expect(dateKeyFromInstant(Date.UTC(2026, 10, 1, 2, 59))).toBe("2026-10-31");
    expect(dateKeyFromInstant(Date.UTC(2027, 0, 1, 2, 59))).toBe("2026-12-31");
    expect(dateKeyFromInstant(Date.UTC(2027, 0, 1, 3, 0))).toBe("2027-01-01");
  });
});

describe("aritmética de datas", () => {
  it("soma dias e meses sem deslocar", () => {
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });

  it("fim do mês considera ano bissexto", () => {
    expect(monthEnd("2028-02")).toBe("2028-02-29");
    expect(monthEnd("2026-02")).toBe("2026-02-28");
  });

  it("diferença em dias e validação", () => {
    expect(daysBetween("2026-10-01", "2026-10-06")).toBe(5);
    expect(isValidDateKey("2026-02-30")).toBe(false);
    expect(isValidDateKey("2026-10-06")).toBe(true);
  });
});

describe("clockFromInstant: hora e minuto no fuso do app", () => {
  it("usa São Paulo (UTC-3), nunca o fuso do aparelho", () => {
    expect(clockFromInstant(Date.UTC(2026, 9, 7, 17, 32))).toBe("14:32");
    expect(clockFromInstant(Date.UTC(2026, 9, 7, 3, 5))).toBe("00:05");
    expect(clockFromInstant(Date.UTC(2026, 9, 7, 2, 59))).toBe("23:59");
  });

  it("sempre com dois dígitos e relógio de 24 horas", () => {
    expect(clockFromInstant(Date.UTC(2026, 9, 7, 12, 0))).toBe("09:00");
    expect(clockFromInstant(Date.UTC(2026, 9, 7, 23, 0))).toBe("20:00");
  });
});

describe("instantFromLocal: dia e horário do relógio de São Paulo -> instante", () => {
  it("é o inverso de dateKeyFromInstant + clockFromInstant", () => {
    expect(instantFromLocal("2026-10-07", 14, 32)).toBe(Date.UTC(2026, 9, 7, 17, 32));
    expect(clockFromInstant(instantFromLocal("2026-10-07", 14, 32)!)).toBe("14:32");
  });

  it("23h30 fica no dia, mesmo sendo o dia seguinte em UTC; 00h30 já é o dia novo", () => {
    const late = instantFromLocal("2026-10-06", 23, 30)!;
    expect(late).toBe(Date.UTC(2026, 9, 7, 2, 30));
    expect(dateKeyFromInstant(late)).toBe("2026-10-06");
    const early = instantFromLocal("2026-10-07", 0, 30)!;
    expect(early).toBe(Date.UTC(2026, 9, 7, 3, 30));
    expect(dateKeyFromInstant(early)).toBe("2026-10-07");
  });

  it("ida e volta em todos os minutos de um dia (nenhum horário se perde)", () => {
    for (let hour = 0; hour < 24; hour += 1) {
      for (const minute of [0, 1, 29, 30, 59]) {
        const instant = instantFromLocal("2026-11-20", hour, minute)!;
        expect(dateKeyFromInstant(instant)).toBe("2026-11-20");
        expect(clockFromInstant(instant)).toBe(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
      }
    }
  });

  it("dia ou horário inválido devolve null", () => {
    expect(instantFromLocal("2026-02-30", 10, 0)).toBeNull();
    expect(instantFromLocal("07/10/2026", 10, 0)).toBeNull();
    expect(instantFromLocal("2026-10-07", 24, 0)).toBeNull();
    expect(instantFromLocal("2026-10-07", 10, 60)).toBeNull();
    expect(instantFromLocal("2026-10-07", -1, 0)).toBeNull();
    expect(instantFromLocal("2026-10-07", 10.5, 0)).toBeNull();
  });
});


import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  dateKeyFromInstant,
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

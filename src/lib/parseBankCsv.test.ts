import { describe, expect, it } from "vitest";
import { categorizeWithRules, parseBankCsv } from "@/lib/financials";

const UNION_BANK_HEADERS =
  "Account Number,Account Name,Processed Date,Description,Check or Slip #,Amount,Credit or Debit";

function unionBankCsv(rows: string[]): string {
  return [UNION_BANK_HEADERS, ...rows].join("\n");
}

describe("parseBankCsv", () => {
  it("reads Credit or Debit instead of treating every positive amount as income", () => {
    const parsed = parseBankCsv(
      unionBankCsv([
        '1234,CKCARBUS        0001,08/03/2026,TO 06762   SBA 504 CSA CCD    124580820401311 26/08/03,,523.32,Debit',
        '1234,CKCARBUS        0001,08/03/2026,DEPOSIT    MERCHANT BANKCD CCD    496126452887 26/08/03,,381.00,Credit',
        '1234,CKCARBUS        0001,08/04/2026,IRVING ENERGY,,8002.13,Debit',
      ])
    );

    expect(parsed).toEqual([
      {
        date: "2026-08-03",
        description: "TO 06762   SBA 504 CSA CCD    124580820401311 26/08/03",
        amount: 523.32,
        type: "expense",
      },
      {
        date: "2026-08-03",
        description: "DEPOSIT    MERCHANT BANKCD CCD    496126452887 26/08/03",
        amount: 381,
        type: "income",
      },
      {
        date: "2026-08-04",
        description: "IRVING ENERGY",
        amount: 8002.13,
        type: "expense",
      },
    ]);
  });

  it("does not use Account Name as the transaction description", () => {
    const parsed = parseBankCsv(
      unionBankCsv([
        "1234,CKCARBUS        0001,08/04/2026,DEPOSIT,,675.00,Credit",
      ])
    );

    expect(parsed).toHaveLength(1);
    expect(parsed[0].description).toBe("DEPOSIT");
    expect(parsed[0].description).not.toContain("CKCARBUS");
  });

  it("skips zero-amount rows", () => {
    const parsed = parseBankCsv(
      unionBankCsv([
        "1234,CKCARBUS        0001,08/17/2026,BILL PAY - CHECK 80025,,0.00,Debit",
        "1234,CKCARBUS        0001,08/17/2026,DEPOSIT    MERCHANT BANKCD CCD    496126452887 26/08/17,,141.50,Credit",
      ])
    );

    expect(parsed).toHaveLength(1);
    expect(parsed[0].amount).toBe(141.5);
    expect(parsed[0].type).toBe("income");
  });

  it("supports separate Debit and Credit columns", () => {
    const parsed = parseBankCsv(
      [
        "Date,Description,Debit,Credit",
        "08/03/2026,SBA 504,523.32,",
        "08/03/2026,DEPOSIT MERCHANT BANKCD,,381.00",
      ].join("\n")
    );

    expect(parsed).toEqual([
      {
        date: "2026-08-03",
        description: "SBA 504",
        amount: 523.32,
        type: "expense",
      },
      {
        date: "2026-08-03",
        description: "DEPOSIT MERCHANT BANKCD",
        amount: 381,
        type: "income",
      },
    ]);
  });

  it("supports signed amounts when no type column exists", () => {
    const parsed = parseBankCsv(
      [
        "Date,Description,Amount",
        "08/03/2026,SBA 504,-523.32",
        "08/03/2026,DEPOSIT MERCHANT BANKCD,381.00",
      ].join("\n")
    );

    expect(parsed.map((row) => row.type)).toEqual(["expense", "income"]);
  });
});

describe("parseBankCsv + categorizeWithRules", () => {
  it("does not dump every row into self_service_revenue", () => {
    const parsed = parseBankCsv(
      unionBankCsv([
        '1234,CKCARBUS        0001,08/03/2026,TO 06762   SBA 504 CSA CCD    124580820401311 26/08/03,,523.32,Debit',
        '1234,CKCARBUS        0001,08/03/2026,DEPOSIT    MERCHANT BANKCD CCD    496126452887 26/08/03,,381.00,Credit',
        '1234,CKCARBUS        0001,08/11/2026,EPM PYMT   FOREMOST PPD     3815024245840 LOWELL SPILLANE,,162.19,Debit',
        '1234,CKCARBUS        0001,08/13/2026,INTUIT *QBooks Online,,26.75,Debit',
      ])
    );

    const categorized = parsed.map((row) => {
      const { category } = categorizeWithRules(row.description, row.type, row.amount, []);
      return { type: row.type, category };
    });

    expect(categorized).toEqual([
      { type: "expense", category: "debt_service" },
      { type: "income", category: "self_service_revenue" },
      { type: "expense", category: "insurance_expense" },
      { type: "expense", category: "needs_review" },
    ]);
    expect(categorized.every((row) => row.category === "self_service_revenue")).toBe(false);
  });

  it("applies an amount rule when one matches", () => {
    const parsed = parseBankCsv(
      unionBankCsv(["1234,CKCARBUS        0001,08/17/2026,BILL PAY - CHECK 80025,,40.00,Debit"])
    );
    expect(parsed).toHaveLength(1);

    const { category, ruleApplied } = categorizeWithRules(
      parsed[0].description,
      parsed[0].type,
      parsed[0].amount,
      [
        {
          id: "rule-1",
          user_id: "user-1",
          vendor_pattern: "__AMOUNT__:expense:40.00",
          category: "trash",
          rule_type: "amount",
          amount: 40,
          transaction_type: "expense",
        },
      ]
    );

    expect(ruleApplied).toBe("amount");
    expect(category).toBe("trash");
  });
});

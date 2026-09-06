import { describe, expect, it } from "vitest";
import {
  csvExactDuplicateKey,
  filterCsvRowsAgainstExisting,
  formatCsvDuplicateSkippedMessage,
  insertCsvTransactionsSkippingDuplicates,
  parseBankCsv,
  type CsvBankTransactionInsert,
  type CsvExactDuplicateKey,
} from "@/lib/financials";

const STORE_ID = "store-cool-road";
const USER_ID = "user-1";

const UNION_BANK_HEADERS =
  "Account Number,Account Name,Processed Date,Description,Check or Slip #,Amount,Credit or Debit";

function unionBankCsv(rows: string[]): string {
  return [UNION_BANK_HEADERS, ...rows].join("\n");
}

function csvInsertRow(
  overrides: Partial<CsvBankTransactionInsert> &
    Pick<CsvBankTransactionInsert, "transaction_date" | "amount" | "description">
): CsvBankTransactionInsert {
  return {
    store_id: STORE_ID,
    user_id: USER_ID,
    category: "self_service_revenue",
    transaction_type: "income",
    original_category: "self_service_revenue",
    status: "needs_review",
    is_reviewed: false,
    excluded: false,
    ...overrides,
  };
}

function parsedCsvToInsertRows(csv: string): CsvBankTransactionInsert[] {
  return parseBankCsv(csv).map((row) =>
    csvInsertRow({
      transaction_date: row.date,
      amount: row.amount,
      description: row.description,
      transaction_type: row.type,
      category: row.type === "income" ? "self_service_revenue" : "needs_review",
      original_category: row.type === "income" ? "self_service_revenue" : "needs_review",
    })
  );
}

function createCsvInsertMock(existing: CsvExactDuplicateKey[]) {
  const inserted: CsvBankTransactionInsert[] = [];
  const supabase = {
    from(table: string) {
      if (table !== "bank_transactions") {
        throw new Error(`unexpected table ${table}`);
      }
      return {
        select() {
          return {
            eq() {
              return {
                order() {
                  return {
                    async range(from: number, to: number) {
                      return { data: existing.slice(from, to + 1), error: null };
                    },
                  };
                },
              };
            },
          };
        },
        async insert(rows: CsvBankTransactionInsert[]) {
          inserted.push(...rows);
          for (const row of rows) {
            existing.push({
              transaction_date: row.transaction_date,
              amount: row.amount,
              description: row.description,
            });
          }
          return { error: null };
        },
      };
    },
  };
  return { supabase, inserted, existing };
}

describe("CSV exact duplicate skip", () => {
  const sampleCsv = unionBankCsv([
    "1234,CKCARBUS        0001,08/03/2026,DEPOSIT    MERCHANT BANKCD CCD    496126452887 26/08/03,,381.00,Credit",
    "1234,CKCARBUS        0001,08/03/2026,SQ260803   SQUARE INC CCD    T3JNHW4R4NWVY7J 26/08/03,,58.58,Credit",
    "1234,CKCARBUS        0001,08/04/2026,IRVING ENERGY,,8002.13,Debit",
  ]);

  it("staging the same CSV twice results in zero new rows the second time", async () => {
    const existing: CsvExactDuplicateKey[] = [];
    const mock = createCsvInsertMock(existing);
    const rows = parsedCsvToInsertRows(sampleCsv);
    expect(rows).toHaveLength(3);

    const first = await insertCsvTransactionsSkippingDuplicates(mock.supabase as never, {
      storeId: STORE_ID,
      rows,
    });
    expect(first).toEqual({ insertedCount: 3, skippedCount: 0, error: null });
    expect(mock.inserted).toHaveLength(3);

    const second = await insertCsvTransactionsSkippingDuplicates(mock.supabase as never, {
      storeId: STORE_ID,
      rows,
    });
    expect(second).toEqual({ insertedCount: 0, skippedCount: 3, error: null });
    expect(mock.inserted).toHaveLength(3);
    expect(formatCsvDuplicateSkippedMessage(second.skippedCount)).toBe(
      "3 rows were skipped as likely duplicates of transactions already in your account."
    );
  });

  it("skips only exact date+amount+description matches and still inserts new rows", async () => {
    const existing: CsvExactDuplicateKey[] = [
      { transaction_date: "2026-08-03", amount: 381, description: "DEPOSIT    MERCHANT BANKCD CCD    496126452887 26/08/03" },
    ];
    const mock = createCsvInsertMock(existing);
    const rows = parsedCsvToInsertRows(sampleCsv);

    const result = await insertCsvTransactionsSkippingDuplicates(mock.supabase as never, {
      storeId: STORE_ID,
      rows,
    });
    expect(result).toEqual({ insertedCount: 2, skippedCount: 1, error: null });
    expect(mock.inserted.map((row) => row.description)).toEqual([
      "SQ260803   SQUARE INC CCD    T3JNHW4R4NWVY7J 26/08/03",
      "IRVING ENERGY",
    ]);
  });

  it("does not skip a same-date same-amount row with a different description", () => {
    const existing = [
      { transaction_date: "2026-08-04", amount: 675, description: "DEPOSIT" },
    ];
    const staged = [
      csvInsertRow({
        transaction_date: "2026-08-04",
        amount: 675,
        description: "DEPOSIT    MERCHANT BANKCD CCD    496126452887 26/08/04",
      }),
    ];
    expect(filterCsvRowsAgainstExisting(staged, existing)).toEqual({
      toInsert: staged,
      skippedCount: 0,
    });
  });

  it("builds a stable exact-match key", () => {
    expect(
      csvExactDuplicateKey({
        transaction_date: "2026-08-03T12:00:00",
        amount: 381,
        description: "DEPOSIT",
      })
    ).toBe("2026-08-03|381.00|DEPOSIT");
  });
});

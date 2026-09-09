import { describe, expect, it } from "vitest";
import {
  applyCsvPossibleDuplicateDecisions,
  csvExactDuplicateKey,
  csvMonthAmountKey,
  filterCsvRowsAgainstExisting,
  findCsvPossibleDuplicates,
  formatCsvDuplicateSkippedMessage,
  formatCsvPossibleDuplicateOnboardingToast,
  formatCsvPossibleDuplicateSaveLabel,
  insertCsvTransactionsSkippingDuplicates,
  parseBankCsv,
  pickClosestCsvDuplicateMatch,
  type CsvBankTransactionInsert,
  type CsvExactDuplicateKey,
  type CsvPossibleDuplicateExisting,
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

describe("findCsvPossibleDuplicates — real 7 Cool Road pairs", () => {
  const capitalOneExisting: CsvPossibleDuplicateExisting = {
    id: "23ff8cfb-6863-4efc-a72a-aa640097262e",
    transaction_date: "2026-09-08",
    amount: 10295.66,
    description: "CRCARDPMT  CAPITAL ONE CCD    CA0A09A3BAF65DB 26/09/08",
    transaction_type: "expense",
    status: "excluded",
    excluded: true,
  };

  const capitalOneStaged = csvInsertRow({
    transaction_date: "2026-09-07",
    amount: 10295.66,
    description: "CAPITAL ONE AUTOPAY PYMT",
    transaction_type: "income",
    category: "self_service_revenue",
    original_category: "self_service_revenue",
  });

  const paystriExisting: CsvPossibleDuplicateExisting = {
    id: "8f2b057e-aef4-4695-b63d-a6ae89cfffc4",
    transaction_date: "2026-07-01",
    amount: 9.95,
    description: "0000000969 PAYSTRI INC CCD    0013246 0620674 26/07/01",
    transaction_type: "expense",
    status: "posted",
    excluded: false,
  };

  const paystriStaged = csvInsertRow({
    transaction_date: "2026-07-29",
    amount: 9.95,
    description: "0000000975 PAYSTRI INC CCD    0013246 0633821 26/07/29",
    transaction_type: "expense",
    category: "cc_processing_fees",
    original_category: "cc_processing_fees",
  });

  const depositDescription = "DEPOSIT    MERCHANT BANKCD CCD    496126452887 26/08/17";
  const depositExisting: CsvPossibleDuplicateExisting = {
    id: "37f10764-d915-4394-b00d-5b1c632d663c",
    transaction_date: "2026-08-17",
    amount: 141.5,
    description: depositDescription,
    transaction_type: "income",
    status: "excluded",
    excluded: true,
  };
  const depositStaged = csvInsertRow({
    transaction_date: "2026-08-17",
    amount: 141.5,
    description: depositDescription,
    transaction_type: "income",
  });

  it("flags the Capital One off-by-one / different-text pair as a possible duplicate", () => {
    const result = findCsvPossibleDuplicates([capitalOneStaged], [capitalOneExisting]);
    expect(result.exactSkip).toEqual([]);
    expect(result.unmatched).toEqual([]);
    expect(result.possible).toHaveLength(1);
    expect(result.possible[0]?.stagedIndex).toBe(0);
    expect(result.possible[0]?.staged.description).toBe("CAPITAL ONE AUTOPAY PYMT");
    expect(result.possible[0]?.match).toEqual(capitalOneExisting);
    expect(csvMonthAmountKey(capitalOneStaged)).toBe(csvMonthAmountKey(capitalOneExisting));
    expect(csvExactDuplicateKey(capitalOneStaged)).not.toBe(csvExactDuplicateKey(capitalOneExisting));
  });

  it("flags the PAYSTRI $9.95 same-month false positive but keeps it insertable", () => {
    const result = findCsvPossibleDuplicates([paystriStaged], [paystriExisting]);
    expect(result.exactSkip).toEqual([]);
    expect(result.possible).toHaveLength(1);
    expect(result.possible[0]?.staged.description).toBe(
      "0000000975 PAYSTRI INC CCD    0013246 0633821 26/07/29"
    );
    expect(result.possible[0]?.match.description).toBe(
      "0000000969 PAYSTRI INC CCD    0013246 0620674 26/07/01"
    );

    const skippedByDefault = applyCsvPossibleDuplicateDecisions(result, {});
    expect(skippedByDefault).toEqual({
      toInsert: [],
      possibleSkippedCount: 1,
      insertAnywayCount: 0,
    });

    const insertedAnyway = applyCsvPossibleDuplicateDecisions(result, { 0: "insert" });
    expect(insertedAnyway).toEqual({
      toInsert: [paystriStaged],
      possibleSkippedCount: 0,
      insertAnywayCount: 1,
    });
  });

  it("auto-skips the exact DEPOSIT MERCHANT BANKCD pair and never flags it as possible", () => {
    const result = findCsvPossibleDuplicates([depositStaged], [depositExisting]);
    expect(result.exactSkip).toEqual([depositStaged]);
    expect(result.possible).toEqual([]);
    expect(result.unmatched).toEqual([]);

    const filtered = filterCsvRowsAgainstExisting([depositStaged], [depositExisting]);
    expect(filtered).toEqual({ toInsert: [], skippedCount: 1 });
  });

  it("picks the closest date when several same-month same-amount rows exist", () => {
    const farther: CsvPossibleDuplicateExisting = {
      ...capitalOneExisting,
      id: "farther",
      transaction_date: "2026-09-01",
    };
    const picked = pickClosestCsvDuplicateMatch(capitalOneStaged, [farther, capitalOneExisting]);
    expect(picked.id).toBe(capitalOneExisting.id);
  });

  it("does not flag a unique new row", () => {
    const unique = csvInsertRow({
      transaction_date: "2026-09-02",
      amount: 1035.93,
      description: "IRVING ENERGY",
      transaction_type: "expense",
      category: "gas",
      original_category: "gas",
    });
    const result = findCsvPossibleDuplicates([unique], [capitalOneExisting, paystriExisting, depositExisting]);
    expect(result).toEqual({ exactSkip: [], possible: [], unmatched: [unique] });
  });

  it("keeps an exact DEPOSIT skip out of possible even when other month+amount pairs are present", () => {
    const result = findCsvPossibleDuplicates(
      [depositStaged, capitalOneStaged],
      [depositExisting, capitalOneExisting]
    );
    expect(result.exactSkip).toEqual([depositStaged]);
    expect(result.possible.map((item) => item.staged.description)).toEqual(["CAPITAL ONE AUTOPAY PYMT"]);
    expect(result.unmatched).toEqual([]);
  });

  it("does not let the exact-match insert helper silently drop the Capital One pair", async () => {
    const existing: CsvExactDuplicateKey[] = [capitalOneExisting];
    const mock = createCsvInsertMock(existing);
    const result = await insertCsvTransactionsSkippingDuplicates(mock.supabase as never, {
      storeId: STORE_ID,
      rows: [capitalOneStaged],
    });
    expect(result).toEqual({ insertedCount: 1, skippedCount: 0, error: null });
    expect(mock.inserted).toEqual([capitalOneStaged]);
  });

  it("formats the save label and onboarding toast", () => {
    expect(formatCsvPossibleDuplicateSaveLabel(4, 1)).toBe("Save 4 new, skip 1 possible duplicate");
    expect(formatCsvPossibleDuplicateSaveLabel(2, 3)).toBe("Save 2 new, skip 3 possible duplicates");
    expect(formatCsvPossibleDuplicateOnboardingToast(1)).toBe(
      "1 imported row matches an existing amount in the same month. Review possible duplicates on the Transactions page."
    );
    expect(formatCsvPossibleDuplicateOnboardingToast(2)).toBe(
      "2 imported rows match existing amounts in the same month. Review possible duplicates on the Transactions page."
    );
  });
});

"""
가계부 엑셀 → 앱 CSV 변환 스크립트
사용법: python3 scripts/migrate.py
"""

import pandas as pd
import os
import re
import uuid

INPUT_FILE = os.path.expanduser("~/Downloads/가계부.xlsx")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ── 카테고리 매핑 ─────────────────────────────────────────────────────────────
INCOME_CATS = {
    "급여": "salary", "월급": "salary",
    "이자": "interest", "이자수입": "interest",
    "적금만기": "saving_return", "적금 만기": "saving_return",
    "전월이월": "other_income",
    "보험금": "other_income", "대여금회수": "other_income", "대여금 회수": "other_income",
    "기타수입": "other_income", "기타": "other_income",
    "보관하기출금": "saving_return", "보관하기 출금": "saving_return",
    "피클플러스": "saving_return",
}

EXPENSE_CATS = {
    "관리비": "living", "생활비": "living", "가스": "living", "수도": "living", "전기": "living",
    "대출이자": "loan",
    "주택청약": "saving", "청약": "saving", "청년도약": "saving", "적금": "saving",
    "보관하기": "saving",
    "교통비": "transport", "버스": "transport", "지하철": "transport", "케이패스": "transport",
    "통신비": "communication", "휴대폰": "communication", "인터넷": "communication",
    "토스모바일": "communication", "인스모바일": "communication",
    "우체국보험": "insurance", "현대해상": "insurance", "동양생명": "insurance", "보험료": "insurance",
    "구독료": "subscription", "유튜브": "subscription", "웨이브": "subscription",
    "배민클럽": "subscription", "넷플릭스": "subscription",
    "쇼핑": "shopping", "미용": "shopping", "쇼핑/미용": "shopping", "미용/쇼핑": "shopping",
    "피아노": "selfdev", "운동": "selfdev", "자기계발": "selfdev", "여가": "selfdev",
    "문화/여가": "selfdev", "배드민턴": "selfdev",
    "선물": "gift", "경조": "gift",
    "여행": "travel",
    "술": "drink", "음료": "drink", "술/음료": "drink",
    "생필품": "daily",
    "카드대금": "card",
    "식비": "food",
    "기타지출": "etc",
}

SKIP_ITEMS = {"합계", "수입합계", "지출합계", "잔액", "nan", "total", "소계", "적금비율",
              "카드대금합계", "수입", "지출", "이월", "전체합계"}

def parse_amount(val) -> int:
    if pd.isna(val):
        return 0
    s = str(val).replace(",", "").replace("원", "").replace(" ", "").replace("\n", "").strip()
    try:
        f = float(s)
        return int(abs(f))
    except:
        return 0

def guess_type_and_cat(name: str, section: str = "") -> tuple[str, str]:
    """항목명과 섹션('income'/'expense'/'')으로 타입·카테고리 추론"""
    n = name.strip()

    # 섹션 힌트가 있으면 우선 적용
    if section == "income":
        for key, cat in INCOME_CATS.items():
            if key in n:
                return "income", cat
        return "income", "other_income"

    if section == "expense":
        for key, cat in EXPENSE_CATS.items():
            if key in n:
                return "expense", cat
        return "expense", "etc"

    # 섹션 모름 → 이름으로 추측
    for key, cat in INCOME_CATS.items():
        if key in n:
            return "income", cat
    for key, cat in EXPENSE_CATS.items():
        if key in n:
            return "expense", cat
    return "expense", "etc"

def detect_account(sheet_name: str) -> str:
    if "토스" in sheet_name:
        return "toss"
    if "국민" in sheet_name:
        return "kb"
    if "광주" in sheet_name:
        return "gwangju"
    return "kb"

# ── 17~22년 가로형 파싱 ────────────────────────────────────────────────────────
def parse_horizontal(sheet_name: str, df: pd.DataFrame, year: int) -> list[dict]:
    """
    구조:
      - 상단 절반(행 0~19): 1~6월
        행 0 = 헤더 "(YY. MM월분)"
        행 1~ = 데이터: 열0=항목명, 열1=1월금액, 열4=2월금액, 열7=3월금액,
                       열10=4월금액, 열13=5월금액, 열16=6월금액
      - 하단 절반(행 21~): 7~12월 (동일 패턴)
    """
    account_id = detect_account(sheet_name)
    records = []

    # 두 블록 정의: (시작행, 끝행, 시작월, 금액이 있는 열 목록)
    # 각 블록에서 열 순서: 0=항목명, 1=1월금액, 4=2월금액, 7=3월, 10=4월, 13=5월, 16=6월
    amount_cols = [1, 4, 7, 10, 13, 16]

    blocks = [
        (1, 20, list(range(1, 7))),    # 행1~19 → 1~6월
        (22, 38, list(range(7, 13))),  # 행22~37 → 7~12월
    ]

    for (row_start, row_end, months) in blocks:
        for r in range(row_start, min(row_end, len(df))):
            item_name = str(df.iloc[r, 0]).strip()
            if not item_name or item_name.lower() in SKIP_ITEMS:
                continue

            tx_type, cat_id = guess_type_and_cat(item_name)

            for i, month in enumerate(months):
                col = amount_cols[i]
                if col >= len(df.columns):
                    continue
                amount = parse_amount(df.iloc[r, col])
                if amount == 0:
                    continue

                records.append({
                    "id": str(uuid.uuid4())[:8],
                    "date": f"{year}-{month:02d}-01",
                    "description": item_name,
                    "amount": amount,
                    "type": tx_type,
                    "accountId": account_id,
                    "categoryId": cat_id,
                    "paymentMethod": "account",
                    "cardId": "",
                    "note": f"이전: {sheet_name}",
                })

    return records

# ── 23~26년 세로형 파싱 ────────────────────────────────────────────────────────
def parse_vertical(sheet_name: str, df: pd.DataFrame, year: int) -> list[dict]:
    """
    구조:
      행 1 = 월 헤더 (열 1~12 = 1월~12월)
      열 0 = 항목명 (행 2 이하)
      열 1~12 = 각 월 금액

    수입 구간: 행 10~22 (급여, 이자, ..., 기타수입)
    지출 구간: 행 23~41 (관리비, 주택청약, ..., 기타지출)
    """
    account_id = detect_account(sheet_name)
    records = []

    # 행 1에서 월 헤더 확인 (열 1~12)
    month_cols: dict[int, int] = {}  # {month_num: col_idx}
    for col_i in range(1, min(13, len(df.columns))):
        val = str(df.iloc[1, col_i]).strip()
        m = re.match(r'^(\d{1,2})$', val)
        if m:
            month_cols[int(m.group(1))] = col_i

    # 헤더 탐색 실패 시 열 1~12를 1~12월로 직접 매핑
    if not month_cols:
        month_cols = {m: m for m in range(1, 13)}

    # 수입/지출 구간을 항목명으로 자동 감지
    section = ""
    INCOME_MARKERS = {"급여", "이자", "기타수입", "보험금"}
    EXPENSE_MARKERS = {"관리비", "주택청약", "교통비", "카드대금", "식비"}

    for r in range(2, len(df)):
        item_name = str(df.iloc[r, 0]).strip()
        if not item_name or item_name.lower() in SKIP_ITEMS:
            continue
        if item_name in ("nan", "NaN"):
            continue

        # 섹션 자동 감지
        if any(m in item_name for m in INCOME_MARKERS):
            section = "income"
        elif any(m in item_name for m in EXPENSE_MARKERS):
            section = "expense"

        tx_type, cat_id = guess_type_and_cat(item_name, section)

        for month_num, col_i in month_cols.items():
            if col_i >= len(df.columns):
                continue
            amount = parse_amount(df.iloc[r, col_i])
            if amount == 0:
                continue

            records.append({
                "id": str(uuid.uuid4())[:8],
                "date": f"{year}-{month_num:02d}-01",
                "description": item_name,
                "amount": amount,
                "type": tx_type,
                "accountId": account_id,
                "categoryId": cat_id,
                "paymentMethod": "account",
                "cardId": "",
                "note": f"이전: {sheet_name}",
            })

    return records

# ── 메인 ──────────────────────────────────────────────────────────────────────
def main():
    print(f"\n📂 파일 읽는 중: {INPUT_FILE}\n")
    xls = pd.ExcelFile(INPUT_FILE)

    bank_sheets = [s for s in xls.sheet_names
                   if any(k in s for k in ["광주은행", "국민은행", "토스뱅크"])
                   and "사본" not in s]

    all_records = []

    for sheet_name in bank_sheets:
        df = pd.read_excel(INPUT_FILE, sheet_name=sheet_name, header=None)
        year_m = re.search(r'(\d{2})년', sheet_name)
        year = int("20" + year_m.group(1)) if year_m else 2024

        if year >= 23:
            records = parse_vertical(sheet_name, df, year)
        else:
            records = parse_horizontal(sheet_name, df, year)

        print(f"  ▶ {sheet_name} → {len(records)}건")
        all_records.extend(records)

    df_out = pd.DataFrame(all_records)
    csv_path = os.path.join(OUTPUT_DIR, "transactions_migrated.csv")
    df_out.to_csv(csv_path, index=False, encoding="utf-8-sig")

    if len(df_out) == 0:
        print("\n⚠️  추출된 데이터가 없습니다. 시트 구조를 확인하세요.")
        return df_out

    print(f"\n✅ 총 {len(df_out)}건 추출")
    print(f"   수입: {len(df_out[df_out['type']=='income'])}건")
    print(f"   지출: {len(df_out[df_out['type']=='expense'])}건")
    print(f"   기간: {df_out['date'].min()} ~ {df_out['date'].max()}")

    print(f"\n📊 카테고리 분포 (상위 10):")
    for cat, cnt in df_out['categoryId'].value_counts().head(10).items():
        print(f"   {cat}: {cnt}건")

    print(f"\n📋 샘플 (첫 10건):")
    cols = ['date','description','amount','type','categoryId']
    print(df_out[cols].head(10).to_string(index=False))

    etc = df_out[df_out['categoryId'] == 'etc']
    if len(etc) > 0:
        print(f"\n⚠️  미분류 항목 ({len(etc)}건) — 수동 확인 권장:")
        for item, cnt in etc['description'].value_counts().head(15).items():
            print(f"   '{item}': {cnt}건")
        etc.to_csv(os.path.join(OUTPUT_DIR, "unmatched.csv"), index=False, encoding="utf-8-sig")

    print(f"\n🎉 저장 완료: {csv_path}")
    return df_out

if __name__ == "__main__":
    main()

-- Issue #1: 상태 전환을 서버 함수로 제한 — status 자체 승격 방지
-- RLS UPDATE policy는 유지하되, status 변경은 서버 함수를 통해서만 가능하도록
CREATE OR REPLACE FUNCTION update_prohibition_status(
  prohibition_id uuid,
  new_status prohibition_status
) RETURNS void AS $$
DECLARE
  current_status prohibition_status;
  owner_id uuid;
BEGIN
  SELECT status, user_id INTO current_status, owner_id
  FROM prohibitions WHERE id = prohibition_id;

  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'Prohibition not found';
  END IF;

  IF owner_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- 유저는 active → succeeded 또는 active → failed만 허용
  IF current_status != 'active' OR new_status NOT IN ('succeeded', 'failed') THEN
    RAISE EXCEPTION 'Invalid status transition: % → %', current_status, new_status;
  END IF;

  UPDATE prohibitions
  SET status = new_status, updated_at = now()
  WHERE id = prohibition_id AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Issue #4: updated_at 자동 갱신 트리거 — 클라이언트 조작 방지
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prohibitions_set_updated_at
  BEFORE UPDATE ON prohibitions
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Issue #5: 반복 금기 중복 방지 유니크 제약
ALTER TABLE prohibitions ADD CONSTRAINT prohibitions_user_title_date_unique
  UNIQUE (user_id, title, date);

-- Issue #6: users 테이블 UPDATE 정책 추가
CREATE POLICY "Users can update own profile" ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Performance: 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_prohibitions_user_date ON prohibitions (user_id, date);
CREATE INDEX IF NOT EXISTS idx_prohibitions_active_date ON prohibitions (status, date) WHERE status = 'active';

-- 반복 금기 그룹 전체 soft delete (RLS 우회)
-- RLS UPDATE 정책이 date >= CURRENT_DATE - 1 day로 제한되어
-- 클라이언트에서 과거 항목을 soft delete할 수 없음.
CREATE OR REPLACE FUNCTION delete_recurring_group(
  group_id uuid
) RETURNS void AS $$
DECLARE
  owner_id uuid;
BEGIN
  SELECT user_id INTO owner_id
  FROM prohibitions
  WHERE recurring_group_id = group_id AND deleted_at IS NULL
  LIMIT 1;

  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'Group not found';
  END IF;

  IF owner_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE prohibitions
  SET deleted_at = now(), updated_at = now()
  WHERE recurring_group_id = group_id AND deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

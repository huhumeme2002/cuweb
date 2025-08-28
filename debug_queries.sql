-- 🔍 DEBUG REQUESTS ISSUE
-- Copy và paste từng query vào psql để kiểm tra

-- 1. Kiểm tra cấu trúc bảng users
\d+ users;

-- 2. Kiểm tra 5 user gần đây nhất
SELECT id, username, requests, email, created_at, updated_at 
FROM users 
ORDER BY updated_at DESC NULLS LAST
LIMIT 5;

-- 3. Kiểm tra các giao dịch requests gần đây
SELECT rt.id, rt.user_id, u.username, rt.requests_amount, rt.description, rt.created_at
FROM request_transactions rt
JOIN users u ON rt.user_id = u.id
ORDER BY rt.created_at DESC
LIMIT 10;

-- 4. Kiểm tra tổng requests của từng user vs transactions
SELECT 
    u.id,
    u.username,
    u.requests as current_requests,
    COALESCE(SUM(rt.requests_amount), 0) as total_transactions,
    u.requests - COALESCE(SUM(rt.requests_amount), 0) as difference
FROM users u
LEFT JOIN request_transactions rt ON u.id = rt.user_id
GROUP BY u.id, u.username, u.requests
HAVING u.requests != COALESCE(SUM(rt.requests_amount), 0)
ORDER BY difference DESC
LIMIT 10;

-- 5. Test một update đơn giản
-- Chọn user ID để test (thay 1 bằng ID thực tế)
-- SELECT id, username, requests FROM users WHERE username LIKE '%test%' LIMIT 1;

-- Backup giá trị hiện tại trước khi test
-- SELECT id, username, requests, updated_at FROM users WHERE id = [USER_ID];

-- Test update (thay [USER_ID] bằng ID thực tế)
-- UPDATE users SET requests = requests + 50, updated_at = NOW() WHERE id = [USER_ID];

-- Kiểm tra kết quả
-- SELECT id, username, requests, updated_at FROM users WHERE id = [USER_ID];

-- Rollback (trừ lại 50 để về trạng thái ban đầu)
-- UPDATE users SET requests = requests - 50, updated_at = NOW() WHERE id = [USER_ID];

-- 6. Kiểm tra triggers có thể gây vấn đề
SELECT 
    trigger_name, 
    event_manipulation, 
    action_timing,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'users';

-- 7. Kiểm tra admin activities (nếu có)
SELECT * FROM admin_activities 
WHERE activity_type = 'adjust_requests'
ORDER BY created_at DESC
LIMIT 5;

-- 8. Kiểm tra constraints và indexes
SELECT 
    conname as constraint_name,
    contype as constraint_type,
    pg_get_constraintdef(oid) as definition
FROM pg_constraint 
WHERE conrelid = 'users'::regclass;

-- 9. Kiểm tra log lỗi gần đây (nếu có bảng logs)
-- SELECT * FROM error_logs WHERE created_at > NOW() - INTERVAL '1 hour' ORDER BY created_at DESC LIMIT 10;
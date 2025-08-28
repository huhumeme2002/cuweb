-- 🔍 KIỂM TRA VẤN ĐỀ REQUESTS
-- Chạy từng query sau khi kết nối psql

-- 1. Kiểm tra user hiện tại và requests
SELECT id, username, requests, updated_at, expiry_time 
FROM users 
WHERE username IN ('khanhdx23', 'Truongthui3011', 'lighthunter007')
ORDER BY updated_at DESC;

-- 2. Kiểm tra transactions requests gần đây nhất
SELECT 
    rt.id,
    u.username,
    rt.requests_amount,
    rt.description,
    rt.created_at,
    u.requests as current_user_requests
FROM request_transactions rt
JOIN users u ON rt.user_id = u.id
WHERE rt.created_at > NOW() - INTERVAL '2 hours'
ORDER BY rt.created_at DESC;

-- 3. Kiểm tra admin activities
SELECT 
    aa.id,
    admin.username as admin_name,
    target.username as target_user,
    aa.description,
    aa.old_value,
    aa.new_value,
    aa.created_at
FROM admin_activities aa
JOIN users admin ON aa.admin_id = admin.id
JOIN users target ON aa.target_user_id = target.id
WHERE aa.activity_type = 'adjust_requests'
    AND aa.created_at > NOW() - INTERVAL '2 hours'
ORDER BY aa.created_at DESC;

-- 4. Test update một user cụ thể (VD: user khanhdx23)
-- BACKUP trước khi test
SELECT id, username, requests, updated_at FROM users WHERE username = 'khanhdx23';

-- Test update +10 requests
UPDATE users SET requests = requests + 10, updated_at = NOW() 
WHERE username = 'khanhdx23';

-- Kiểm tra kết quả
SELECT id, username, requests, updated_at FROM users WHERE username = 'khanhdx23';

-- Rollback về trạng thái cũ (trừ 10)
UPDATE users SET requests = requests - 10, updated_at = NOW() 
WHERE username = 'khanhdx23';

-- Verify rollback
SELECT id, username, requests, updated_at FROM users WHERE username = 'khanhdx23';

-- 5. Kiểm tra có constraint hay trigger nào không
SELECT 
    conname as constraint_name,
    contype as constraint_type
FROM pg_constraint 
WHERE conrelid = 'users'::regclass;

-- 6. Kiểm tra indexes trên bảng users
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'users';

-- 7. Tìm user có requests cao nhất
SELECT username, requests, updated_at 
FROM users 
ORDER BY requests DESC 
LIMIT 5;

-- 8. Tổng requests trong hệ thống
SELECT 
    COUNT(*) as total_users,
    SUM(requests) as total_requests,
    AVG(requests) as avg_requests,
    MAX(requests) as max_requests
FROM users;
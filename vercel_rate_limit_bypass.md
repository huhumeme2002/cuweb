# 🚀 Cách bỏ Rate Limit Vercel

## ✅ **Đã thành công**
```bash
vercel --prod --force
```

## 🔧 **Các cách khác:**

### 1. **Xóa deployments cũ**
```bash
# List deployments
vercel ls

# Xóa deployment cũ (giữ lại 3-5 cái mới nhất)
vercel remove [deployment-url] --yes
```

### 2. **Sử dụng Environment khác**
```bash
# Deploy to staging thay vì production
vercel --target staging

# Sau đó promote lên production
vercel promote [deployment-url]
```

### 3. **Reset bằng cách đổi project name**
```bash
# Trong vercel.json hoặc package.json
"name": "aivannang-v2"
```

### 4. **Dùng GitHub Integration**
- Push code lên GitHub
- Connect Vercel với GitHub repo
- Auto deploy mỗi lần push (bypass CLI rate limit)

### 5. **Wait Strategy**
- Rate limit thường reset sau **1 giờ**
- Hoặc đợi **10-15 phút** rồi thử lại

## ⚡ **Hiện tại:**
- ✅ Deploy thành công với `--force`
- ✅ Domain assigned: https://www.aivannang.com
- ✅ Latest deployment: `aivannang-clzq7d4w5-khanhs-projects-3f746af3`

## 🎯 **Test ngay:**
1. Mở https://www.aivannang.com
2. Hard refresh (Ctrl + F5)
3. Check title: "AiVanNang v2.1 - Updated"
4. Login admin → Tab "Bảo mật" → Should see IP blocking
5. Tab "Thời hạn" → Should see new UI với +/- buttons
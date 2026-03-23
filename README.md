# NEPOS (Restaurant / Cafe POS)

NEPOS là ứng dụng POS offline-first cho quán cafe/nhà hàng, tối ưu cho tablet + desktop.

## Công nghệ chính
- React 18 + TypeScript + Vite
- Supabase (Auth + Postgres + Realtime)
- Dexie (IndexedDB local) cho offline queue
- TailwindCSS + Lucide icons
- Recharts (màn hình báo cáo)

## Tính năng nổi bật
- Quản lý bàn (FloorPlan), Menu, Dashboard vận hành
- Checkout + in hóa đơn + QR thanh toán
- Đồng bộ realtime order/order_items giữa nhiều thiết bị
- Tax/Accounting theo hướng TT152 (S2a/S2c/S2d/S2e export)
- Phân quyền Admin / Manager / Staff + PIN bảo vệ thao tác nhạy cảm
- Offline-first: vẫn bán được khi mất mạng, tự sync khi online

## Cấu trúc project (thực tế)
```txt
projects/nepos/
├── App.tsx
├── screens/               # Dashboard, Menu, FloorPlan, Inventory, Reports, Settings, TaxDeclaration...
├── components/
├── context/               # AuthContext, DataContext, NetworkContext...
├── hooks/
├── services/              # printService, TaxService, SettingsService...
├── types/
├── utils/
├── i18n/
├── db.ts                  # Dexie schema
├── supabase.ts
├── vite.config.ts
└── package.json
```

## Chạy local
```bash
cd projects/nepos
npm install
npm run dev
```

Build production:
```bash
npm run build
npm run preview
```

## Environment
Tạo `.env.local` (hoặc `.env`) trong `projects/nepos`:
```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Lưu ý quan trọng
### 1) `npm run dev` báo thiếu vite/tsc
Nếu môi trường đang để production (`NODE_ENV=production`, `npm omit=dev`) thì devDependencies không được cài.

Fix nhanh:
```bash
npm config set omit ""
unset NODE_ENV
npm install
npm run dev
```

### 2) In hóa đơn trên tablet Android
- `printMethod=browser`: đẹp trên desktop, nhưng tablet có thể không in trực tiếp tốt.
- `printMethod=rawbt`: dùng RawBT cho Android/Bluetooth.

Project đã có template **RawBT compact** riêng để cải thiện chất lượng in trên tablet.

### 3) Offline + đồng bộ
- Order cập nhật local trước, sau đó đẩy queue lên server.
- Có realtime subscription để thiết bị khác nhận thay đổi nhanh.

## Checklist smoke test sau khi pull code
1. Login/logout OK
2. Tạo đơn -> thanh toán -> Reports cập nhật
3. Inventory load không treo
4. Settings PIN load được danh sách user
5. In test ticket (desktop hoặc rawbt theo thiết bị)
6. Tax export S2a/S2c/S2d/S2e tạo file thành công

## Gợi ý quy trình phát triển
- `npm run lint` trước khi commit
- `npm run build` để verify production bundle
- Commit message theo conventional commits (`fix:`, `feat:`, `perf:`)

---
Nếu cần onboarding nhanh cho nhân viên vận hành (setup máy in, PIN, sync nhiều máy), ưu tiên vào **Settings > Thiết lập nhanh**.

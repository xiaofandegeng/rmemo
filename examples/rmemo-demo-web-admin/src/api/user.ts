export type UserItem = {
  id: number;
  name: string;
  phone: string;
  enabled: boolean;
};

const MOCK_USERS: UserItem[] = [
  { id: 1, name: "Alice", phone: "13800000001", enabled: true },
  { id: 2, name: "Bob", phone: "13800000002", enabled: false },
  { id: 3, name: "Carol", phone: "13800000003", enabled: true }
];

export async function fetchUsers(keyword = ""): Promise<UserItem[]> {
  const q = keyword.trim().toLowerCase();
  if (!q) return MOCK_USERS;
  return MOCK_USERS.filter((item) => {
    return item.name.toLowerCase().includes(q) || item.phone.includes(q);
  });
}

export async function toggleUserStatus(id: number): Promise<UserItem | null> {
  const hit = MOCK_USERS.find((item) => item.id === id);
  if (!hit) return null;
  hit.enabled = !hit.enabled;
  return hit;
}

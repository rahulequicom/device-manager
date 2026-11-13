export function deviceDetailState(id: string) {
  return { index: 1, routes: [{ name: 'Devices' as const }, { name: 'Details' as const, params: { id } }] };
}
export function deviceRegisterState() {
  return { index: 0, routes: [{ name: 'Devices' as const }] };
}

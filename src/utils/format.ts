export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num);
}

export function truncateAddress(address: string, lead = 6, tail = 4): string {
  if (!address) return '';
  if (address.length <= lead + tail) return address;
  return `${address.slice(0, lead)}...${address.slice(-tail)}`;
}

export function formatAllocation(num: number): string {
  return new Intl.NumberFormat('en-US').format(num);
}
// 大富翁棋盘数据定义
// 经典 40 格布局（顺时针），包含地产、车站、公共事业、税、机会、社区福利等

// 单元格类型
export const CELL = {
  GO: 'go',                 // 起点
  STREET: 'street',         // 街道地产（按颜色分组）
  RAILROAD: 'railroad',     // 车站
  UTILITY: 'utility',       // 公共事业
  TAX: 'tax',               // 税
  CHANCE: 'chance',         // 机会
  COMMUNITY: 'community',   // 社区福利
  JAIL: 'jail',             // 监狱（路过）
  FREE_PARKING: 'free-parking',
  GO_TO_JAIL: 'go-to-jail',
};

// 颜色分组定义（用于判断垄断）
export const COLOR_GROUPS = {
  brown: { name: '棕色', housePrice: 50 },
  'light-blue': { name: '浅蓝', housePrice: 50 },
  pink: { name: '粉色', housePrice: 100 },
  orange: { name: '橙色', housePrice: 100 },
  red: { name: '红色', housePrice: 150 },
  yellow: { name: '黄色', housePrice: 150 },
  green: { name: '绿色', housePrice: 200 },
  'dark-blue': { name: '深蓝', housePrice: 200 },
};

// 40 格棋盘
export const BOARD = [
  { index: 0,  type: CELL.GO, name: '起点', short: 'GO' },
  { index: 1,  type: CELL.STREET, name: '地中海大道', group: 'brown', price: 60,  rent: 2 },
  { index: 2,  type: CELL.COMMUNITY, name: '社区福利' },
  { index: 3,  type: CELL.STREET, name: '波罗的海大道', group: 'brown', price: 60,  rent: 4 },
  { index: 4,  type: CELL.TAX, name: '所得税', amount: 200 },
  { index: 5,  type: CELL.RAILROAD, name: '东方车站', price: 200, rent: 25 },
  { index: 6,  type: CELL.STREET, name: '东方大道', group: 'light-blue', price: 100, rent: 6 },
  { index: 7,  type: CELL.CHANCE, name: '机会' },
  { index: 8,  type: CELL.STREET, name: '佛蒙特大道', group: 'light-blue', price: 100, rent: 6 },
  { index: 9,  type: CELL.STREET, name: '康涅狄格大道', group: 'light-blue', price: 120, rent: 8 },
  { index: 10, type: CELL.JAIL, name: '监狱', short: '监狱' },
  { index: 11, type: CELL.STREET, name: '圣查尔斯广场', group: 'pink', price: 140, rent: 10 },
  { index: 12, type: CELL.UTILITY, name: '电力公司', price: 150, rent: 0 },
  { index: 13, type: CELL.STREET, name: '州大道', group: 'pink', price: 140, rent: 10 },
  { index: 14, type: CELL.STREET, name: '弗吉尼亚大道', group: 'pink', price: 160, rent: 12 },
  { index: 15, type: CELL.RAILROAD, name: '宾夕法尼亚车站', price: 200, rent: 25 },
  { index: 16, type: CELL.STREET, name: '圣詹姆斯广场', group: 'orange', price: 180, rent: 14 },
  { index: 17, type: CELL.COMMUNITY, name: '社区福利' },
  { index: 18, type: CELL.STREET, name: '田纳西大道', group: 'orange', price: 180, rent: 14 },
  { index: 19, type: CELL.STREET, name: '纽约大道', group: 'orange', price: 200, rent: 16 },
  { index: 20, type: CELL.FREE_PARKING, name: '免费停车' },
  { index: 21, type: CELL.STREET, name: '肯塔基大道', group: 'red', price: 220, rent: 18 },
  { index: 22, type: CELL.CHANCE, name: '机会' },
  { index: 23, type: CELL.STREET, name: '印第安纳大道', group: 'red', price: 220, rent: 18 },
  { index: 24, type: CELL.STREET, name: '伊利诺伊大道', group: 'red', price: 240, rent: 20 },
  { index: 25, type: CELL.RAILROAD, name: 'B&O 车站', price: 200, rent: 25 },
  { index: 26, type: CELL.STREET, name: '大西洋大道', group: 'yellow', price: 260, rent: 22 },
  { index: 27, type: CELL.STREET, name: '文特诺大道', group: 'yellow', price: 260, rent: 22 },
  { index: 28, type: CELL.UTILITY, name: '自来水公司', price: 150, rent: 0 },
  { index: 29, type: CELL.STREET, name: '马文花园', group: 'yellow', price: 280, rent: 24 },
  { index: 30, type: CELL.GO_TO_JAIL, name: '入狱', short: '入狱' },
  { index: 31, type: CELL.STREET, name: '太平洋大道', group: 'green', price: 300, rent: 26 },
  { index: 32, type: CELL.STREET, name: '北卡罗来纳大道', group: 'green', price: 300, rent: 26 },
  { index: 33, type: CELL.COMMUNITY, name: '社区福利' },
  { index: 34, type: CELL.STREET, name: '宾夕法尼亚大道', group: 'green', price: 320, rent: 28 },
  { index: 35, type: CELL.RAILROAD, name: '短线车站', price: 200, rent: 25 },
  { index: 36, type: CELL.CHANCE, name: '机会' },
  { index: 37, type: CELL.STREET, name: '公园广场', group: 'dark-blue', price: 350, rent: 35 },
  { index: 38, type: CELL.TAX, name: '奢侈税', amount: 100 },
  { index: 39, type: CELL.STREET, name: '板桥大道', group: 'dark-blue', price: 400, rent: 50 },
];

// 机会卡
export const CHANCE_CARDS = [
  { id: 'c1', text: '银行支付你分红 $150', effect: { type: 'money', amount: 150 } },
  { id: 'c2', text: '向银行缴纳所得税 $100', effect: { type: 'money', amount: -100 } },
  { id: 'c3', text: '前进到起点，领取 $200', effect: { type: 'goto', index: 0, collect: true } },
  { id: 'c4', text: '前往监狱', effect: { type: 'jail' } },
  { id: 'c5', text: '向每位其他玩家收取 $50', effect: { type: 'collect-each', amount: 50 } },
  { id: 'c6', text: '后退 3 格', effect: { type: 'move', steps: -3 } },
  { id: 'c7', text: '前进 5 格', effect: { type: 'move', steps: 5 } },
  { id: 'c8', text: '银行奖励 $50', effect: { type: 'money', amount: 50 } },
];

// 社区福利卡
export const COMMUNITY_CARDS = [
  { id: 'cc1', text: '社区服务奖金 $100', effect: { type: 'money', amount: 100 } },
  { id: 'cc2', text: '支付医疗费 $50', effect: { type: 'money', amount: -50 } },
  { id: 'cc3', text: '收到生日礼物 $20', effect: { type: 'money', amount: 20 } },
  { id: 'cc4', text: '支付房屋维修费 $40', effect: { type: 'money', amount: -40 } },
  { id: 'cc5', text: '前进到起点，领取 $200', effect: { type: 'goto', index: 0, collect: true } },
  { id: 'cc6', text: '后退 2 格', effect: { type: 'move', steps: -2 } },
  { id: 'cc7', text: '领取咨询费 $25', effect: { type: 'money', amount: 25 } },
  { id: 'cc8', text: '缴纳学费 $30', effect: { type: 'money', amount: -30 } },
];

// 通过棋盘索引查找格子
export function getCell(index) {
  return BOARD[index];
}

// 判断某格是否为可购买的地产（街道/车站/公共事业）
export function isPurchasable(cell) {
  return (
    cell &&
    (cell.type === CELL.STREET || cell.type === CELL.RAILROAD || cell.type === CELL.UTILITY)
  );
}

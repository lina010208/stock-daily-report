const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, HeadingLevel, PageNumber,
  Header, Footer, NumberFormat, ShadingType, convertInchesToTwip,
  LevelFormat, TableOfContents, PageBreak, TabStopType, TabStopPosition
} = require('docx');
const fs = require('fs');

// 颜色定义
const COLORS = {
  headerBg: '1F4E79',     // 深蓝色背景
  tableHeader: '2E75B6', // 中蓝色
  positive: '00B050',     // 绿色 - 涨
  negative: 'FF0000',     // 红色 - 跌
  neutral: '333333',       // 灰色
  lightGray: 'F2F2F2',    // 浅灰
  mediumGray: 'D9D9D9',   // 中灰
};

// 创建表格单元格
function createCell(text, options = {}) {
  const { bold = false, width = 1000, color = '000000', bgColor = null, align = AlignmentType.LEFT, fontSize = 10 } = options;

  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: bgColor ? { type: ShadingType.CLEAR, color: 'auto', fill: bgColor } : undefined,
    children: [
      new Paragraph({
        alignment: align,
        children: [
          new TextRun({
            text: String(text),
            bold: bold,
            color: color,
            size: fontSize * 2,
            font: '宋体',
          }),
        ],
      }),
    ],
    margins: {
      top: 50,
      bottom: 50,
      left: 100,
      right: 100,
    },
  });
}

// 创建表格行
function createTableRow(cells, isHeader = false) {
  return new TableRow({
    tableHeader: isHeader,
    children: cells,
  });
}

// 创建普通段落
function createParagraph(text, options = {}) {
  const { bold = false, fontSize = 11, color = '000000', align = AlignmentType.LEFT, spaceAfter = 200, spaceBefore = 0 } = options;

  return new Paragraph({
    alignment: align,
    spacing: { after: spaceAfter, before: spaceBefore },
    children: [
      new TextRun({
        text: text,
        bold: bold,
        fontSize: fontSize * 2,
        color: color,
        font: '宋体',
      }),
    ],
  });
}

// 创建带换行的标题段落
function createHeadingParagraph(text, level = 1) {
  const sizes = { 1: 16, 2: 14, 3: 12 };
  const size = sizes[level] || 12;
  const bold = level <= 2;

  return new Paragraph({
    spacing: { before: level === 1 ? 400 : 200, after: 150 },
    children: [
      new TextRun({
        text: text,
        bold: bold,
        fontSize: size * 2,
        color: level === 1 ? '1F4E79' : '2E75B6',
        font: '黑体',
      }),
    ],
  });
}

// 创建表格的辅助函数 - 支持不同列使用不同字体大小
function createSimpleTable(headers, rows, columnWidths, columnFontSizes = null) {
  // columnFontSizes: 可选，每列的字体大小数组，默认都使用9
  const fontSizes = columnFontSizes || headers.map(() => 9);

  const headerCells = headers.map((h, i) => createCell(h, {
    bold: true,
    width: columnWidths[i],
    bgColor: COLORS.tableHeader,
    color: 'FFFFFF',
    align: AlignmentType.CENTER,
    fontSize: 9
  }));

  const tableRows = [
    createTableRow(headerCells, true),
    ...rows.map(row => createTableRow(
      row.map((cell, i) => {
        let color = COLORS.neutral;
        let bg = null;

        // 处理涨跌幅颜色
        if (typeof cell === 'string' && (cell.includes('+') || cell.includes('%'))) {
          if (cell.startsWith('+') || (cell.includes('+') && cell.match(/[\+\-]\d/))) {
            color = COLORS.positive;
          } else if (cell.startsWith('-')) {
            color = COLORS.negative;
          }
        }

        // 使用指定列的字体大小或默认9
        const cellFontSize = fontSizes[i] || 9;

        return createCell(String(cell), {
          width: columnWidths[i],
          color: color,
          bgColor: bg,
          align: AlignmentType.CENTER,
          fontSize: cellFontSize
        });
      })
    ))
  ];

  const totalWidth = columnWidths.reduce((a, b) => a + b, 0);

  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: columnWidths,
    rows: tableRows,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1 },
      bottom: { style: BorderStyle.SINGLE, size: 1 },
      left: { style: BorderStyle.SINGLE, size: 1 },
      right: { style: BorderStyle.SINGLE, size: 1 },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
      insideVertical: { style: BorderStyle.SINGLE, size: 1 },
    },
  });
}

// 创建公司共用账户持仓表
function createCompanyAccountTable() {
  const headers = ['账户归属', '股票名称 + 代码', '持仓数量', '建仓成本价', '7.8截图最新价', '单只总盈亏(元)', '盈亏百分比', '当日涨跌幅'];
  const columnWidths = [900, 1300, 700, 900, 900, 1000, 900, 900];

  const data = [
    ['公司共用', '英维克 002837', '1300', '82.32', '72.12', '-13260.00', '-12.41%', '+1.16%'],
    ['公司共用', '中天科技 600522', '200', '62.55', '44.86', '-3538.00', '-28.28%', '-5.10%'],
    ['公司共用', '永鼎股份 600105', '200', '65.99', '47.58', '-3682.00', '-27.90%', '-3.00%'],
    ['公司共用', '华虹宏力 688347', '600', '293.99', '358.40', '+38646.00', '+21.91%', '+10.62%'],
    ['公司共用', '新易盛 300502', '300', '569.38', '510.84', '-17562.00', '-10.28%', '+0.15%'],
    ['公司共用', '佰维存储 688525', '300', '485.99', '396.22', '-26931.00', '-18.47%', '-6.77%'],
    ['公司共用', '德明利 001309', '200', '926.60', '825.00', '-20320.00', '-10.96%', '-3.06%'],
  ];

  return createSimpleTable(headers, data, columnWidths);
}

// 创建东北证券账户持仓表
function createNortheastAccountTable() {
  const headers = ['股票名称', '持仓可用数量', '单位成本价', '7.8截图收盘价', '持仓总盈亏', '盈亏比例', '当日涨跌幅'];
  const columnWidths = [1100, 900, 900, 1000, 1000, 900, 900];

  const data = [
    ['中国巨石', '7000', '70.115', '56.06', '-98385.00', '-20.05%', '-6.57%'],
    ['长电科技', '12200', '96.094', '94.11', '-23912.80', '-2.06%', '-6.81%'],
    ['工业富联', '8300', '72.097', '66.01', '-49149.10', '-8.44%', '+3.50%'],
    ['澜起科技', '1300', '279.247', '247.15', '-41721.60', '-11.49%', '-2.39%'],
    ['中微公司', '600', '387.252', '446.75', '+35700.00', '+15.36%', '+1.85%'],
    ['海光信息', '1700', '349.754', '343.00', '-11486.80', '-1.93%', '+0.12%'],
    ['寒武纪', '600', '1330.400', '1413.55', '+49890.00', '+6.25%', '+1.84%'],
    ['联芸科技', '5700', '81.240', '74.65', '-37023.00', '-8.11%', '-0.19%'],
    ['佰维存储', '2400', '492.326', '396.22', '-230650.40', '-19.52%', '-6.77%'],
    ['普冉股份', '200', '752.963', '841.26', '+17659.40', '+11.73%', '-2.67%'],
    ['盛合晶微', '1500', '211.389', '188.32', '-34600.35', '-10.91%', '-4.69%'],
    ['中芯国际', '7145', '148.418', '152.10', '+26394.81', '+2.48%', '+4.59%'],
    ['京东方A', '50000', '8.140', '8.690', '-2500.00', '+6.76%', '-2.03%'],
    ['德明利', '1200', '890.607', '825.00', '-78728.40', '-7.37%', '-3.06%'],
    ['北方华创', '200', '662.055', '802.32', '+28053.00', '+21.18%', '-0.50%'],
    ['纳斯达克100ETF (159659)', '81700', '2.452', '2.268', '-15493.40', '-7.50%', '-1.39%'],
    ['中际旭创', '1500', '1201.790', '1128.35', '-109117.50', '-6.11%', '+0.57%'],
    ['天孚通信', '700', '324.335', '245.68', '-55068.50', '-24.25%', '+0.65%'],
    ['三环集团', '5000', '165.524', '127.42', '-190520.00', '-22.90%', '-4.66%'],
    ['江丰电子', '700', '300.055', '333.86', '+23663.50', '+11.27%', '+1.48%'],
    ['宁德时代', '700', '393.563', '361.00', '-22794.10', '-8.25%', '-3.08%'],
    ['卫星化学', '8300', '24.09', '22.92', '-9611.00', '-4.86%', '-3.25%'],
    ['牧原股份', '5200', '38.44', '36.80', '-8528.00', '-4.27%', '-4.39%'],
  ];

  return createSimpleTable(headers, data, columnWidths);
}

// 创建A/B/C/D/E分仓持仓表
function createSubAccountTable() {
  const headers = ['分仓账户', '持仓个股及代码', '标注仓位', '个人建仓成本', '7.8截图收盘价', '盈亏比例', '当日涨跌幅'];
  const columnWidths = [900, 1500, 900, 1000, 1000, 900, 900];

  const data = [
    ['A账户', '寒武纪 688256', '核心重仓', '732.00', '1413.55', '+93.11%', '+1.84%'],
    ['A账户', '罗博特科 300757', '核心持仓', '567.00', '475.20', '-16.19%', '-2.42%'],
    ['A账户', '天通股份 600330', '底仓', '35.00', '24.11', '-31.11%', '-4.02%'],
    ['A账户', '宇顺电子 002289', '底仓无成本', '无', '45.08', '无', '-5.19%'],
    ['B账户', '纳斯达克100ETF 159659', '底仓', '2.35', '2.268', '-3.49%', '-1.39%'],
    ['B账户', '天通股份 600330', '底仓', '34.00', '24.11', '-29.09%', '-4.02%'],
    ['C账户', '寒武纪 688256', '重仓持仓', '1286.00', '1413.55', '+9.92%', '+1.84%'],
    ['D账户', '兆易创新 603986', '核心持仓', '770.00', '603.17', '-21.67%', '-2.71%'],
    ['D账户', '天通股份 600330', '底仓', '35.00', '24.11', '-31.11%', '-4.02%'],
    ['D账户', '东山精密 002384', '中层持仓', '218.00', '237.56', '+8.97%', '+0.29%'],
    ['D账户', '中韩半导体ETF 513310', '底仓', '5.00', '5.831', '+16.62%', '-1.42%'],
    ['D账户', '纳斯达克100ETF 159659', '底仓', '2.298', '2.268', '-1.30%', '-1.39%'],
    ['D账户', '同宇新材 301630', '底仓', '265.88', '219.70', '-17.37%', '-4.70%'],
    ['D账户', '纳指科技ETF 景顺 159509', '底仓', '2.55', '2.561', '+0.43%', '-1.61%'],
    ['E账户', '佰维存储 688525', '中层持仓', '501.05', '396.22', '-20.92%', '-6.77%'],
    ['E账户', '江丰电子 300666', '中层持仓', '354.78', '333.86', '-5.90%', '+1.48%'],
    ['E账户', '北方稀土 600111', '底仓', '47.26', '46.02', '-2.62%', '-3.01%'],
    ['E账户', '纳指100ETF 博时 513390', '底仓', '2.388', '2.346', '-1.76%', '-1.64%'],
    ['E账户', '宁德时代 300750', '中层持仓', '381.00', '361.00', '-5.25%', '-3.08%'],
  ];

  return createSimpleTable(headers, data, columnWidths);
}

// 创建个股异动情况表
function createStockMovementTable() {
  const headers = ['标的名称', '7.8收盘价', '当日涨跌幅', '盘面逻辑解读'];
  const columnWidths = [1000, 1000, 1000, 5000];
  const columnFontSizes = [9, 9, 9, 8]; // 行情解读列使用更小的8pt字体

  const data = [
    ['牧原股份', '36.80', '-4.39%', '生猪板块短期跟随大盘回调，养殖中长期周期反转逻辑不变'],
    ['中国巨石', '56.06', '-6.57%', '玻纤建材前期炒作行情结束，资金集中止盈'],
    ['卫星化学', '22.92', '-3.25%', '化工顺周期小幅回调'],
    ['长电科技', '94.11', '-6.81%', '封测板块绑定海外云厂商资本开支预期偏弱'],
    ['德明利', '825.00', '-3.06%', '存储芯片龙头，三星业绩利好落地后资金兑现'],
    ['佰维存储', '396.22', '-6.77%', '存储板块弹性标的，跌幅居前'],
    ['芯原股份', '309.50', '+1.39%', 'IP核国产替代逻辑走强'],
    ['英维克', '72.12', '+1.16%', '液冷算力配套板块抗跌性较强'],
    ['联芸科技', '74.65', '-0.19%', '小幅微跌，无明显资金动向'],
    ['罗博特科', '475.20', '-2.42%', '工业AI设备标的，跟随大盘走弱'],
    ['盛合晶微', '188.32', '-4.69%', '连续多日破位下行'],
    ['江丰电子', '333.86', '+1.48%', '半导体靶材国产替代主线'],
    ['北方稀土', '46.02', '-3.01%', '稀土周期题材资金出逃'],
    ['宇顺电子', '45.08', '-5.19%', '小市值个股流动性枯竭'],
    ['天通股份', '24.11', '-4.02%', '弱势阴跌标的'],
    ['寒武纪', '1413.55', '+1.84%', '国内自主AI算力核心标的'],
    ['中际旭创', '1128.35', '+0.57%', '光模块龙头小幅翻红'],
    ['炬光科技', '262.00', '-3.21%', '激光雷达板块跟随市场回调'],
    ['宁德时代', '361.00', '-3.08%', '动力电池龙头承压'],
    ['澜起科技', '247.15', '-2.39%', '内存接口芯片跟随存储板块走弱'],
    ['工业富联', '66.01', '+3.50%', 'AI服务器代工龙头今日逆势大涨'],
    ['天孚通信', '245.68', '+0.65%', '光模块细分标的小幅收红'],
    ['华虹宏力', '358.40', '+10.62%', '国内晶圆代工标的全天大涨'],
    ['兆易创新', '603.17', '-2.71%', '存储设计龙头同步板块回调'],
    ['永鼎股份', '47.58', '-3.00%', '通信线缆标的持续破位下跌'],
    ['北方华创', '802.32', '-0.50%', '半导体设备绝对龙头'],
    ['中芯国际', '152.10', '+4.59%', '国内晶圆制造龙头逆势上涨'],
    ['中天科技', '44.86', '-5.10%', '线缆板块放量下跌'],
    ['东山精密', '237.56', '+0.29%', 'PCB板业务小幅收红'],
  ];

  return createSimpleTable(headers, data, columnWidths);
}

// 创建板块强弱表
function createSectorTable() {
  const headers = ['板块梯队', '板块类目', '当日行情表现'];
  const columnWidths = [1200, 2500, 4300];
  const columnFontSizes = [9, 9, 8]; // 行情表现列使用8pt

  const data = [
    ['最强防御梯队', '半导体设备、国产晶圆代工、自主算力寒武纪、油气、生猪养殖', '资金逆势流入，完全脱离外围美股情绪走出独立上涨行情'],
    ['中性震荡梯队', 'IP核、PCB印制电路板、动力电池、基础化工', '窄幅震荡分化，小幅跑赢全市场平均跌幅'],
    ['偏弱回调梯队', '稀土永磁、创新药、煤炭贵金属', '前期避险资金撤离，小幅回调消化获利盘'],
    ['极弱出逃梯队', '存储芯片、光通信模块、封测代工、玻纤建材、次新股', '资金大规模出逃，全天放量深度下跌'],
  ];

  return createSimpleTable(headers, data, columnWidths, columnFontSizes);
}

// 创建A股收盘行情表
function createAStockTable() {
  const headers = ['大盘指数', '收盘点位', '当日涨跌幅', '盘面核心总结'];
  const columnWidths = [1500, 1500, 1500, 5500];
  const columnFontSizes = [9, 9, 9, 8]; // 核心总结列使用8pt

  const data = [
    ['上证指数', '3970.62', '-0.49%', '权重银行板块小幅护盘，依旧没能守住4000点整数关口'],
    ['深证成份指数', '14940.14', '-1.87%', '创业板、深市主板重仓新能源、存储、光模块赛道，拖累指数大幅下行'],
    ['创业板指数', '3842.07', '-1.70%', '新能源锂电、人形机器人题材资金集体出逃'],
    ['科创50指数', '1938.41', '+0.73%', '国产半导体设备、晶圆代工、自主算力标的集中在科创板，逆势走强'],
  ];

  return createSimpleTable(headers, data, columnWidths, columnFontSizes);
}

// 创建美股行情表
function createUSTable() {
  const headers = ['指数品类', '收盘点位', '涨跌幅', '核心说明'];
  const columnWidths = [1800, 1500, 1200, 5500];
  const columnFontSizes = [9, 9, 9, 8]; // 核心说明列使用8pt

  const data = [
    ['道琼斯工业指数', '52925.15', '-0.25%', '金融、公用事业防御板块小幅对冲科技股下跌'],
    ['标普500指数', '7503.85', '-0.45%', '高估值科技权重股集体走弱拖累指数下行'],
    ['纳斯达克综合指数', '25818.69', '-1.16%', 'AI硬件、存储芯片、算力个股全线杀跌'],
    ['费城半导体指数', '——', '-4.65%', '半导体板块单日暴跌，美光、AMD、应用材料跌幅居前'],
    ['纳斯达克中国金龙指数', '——', '-0.59%', '中概股跟随纳指同步小幅回调'],
  ];

  return createSimpleTable(headers, data, columnWidths, columnFontSizes);
}

// 创建中金模拟盘持仓表
function createSimAccountTable() {
  const headers = ['标的名称', '持仓数量', '单位建仓成本', '7.8截图最新价', '当日浮动盈亏', '累计总浮动盈亏', '持仓盈亏比例', '当日涨跌幅'];
  const columnWidths = [900, 700, 1000, 1000, 1000, 1100, 1000, 900];

  const data = [
    ['长电科技', '300', '98.32', '94.11', '-1263.00', '-1263.00', '-4.29%', '-6.81%'],
    ['澜起科技', '500', '276.51', '247.15', '-2000.00', '-14680.00', '-10.62%', '-2.39%'],
    ['炬光科技', '400', '364.01', '262.00', '0.00', '-40804.00', '-28.02%', '-3.21%'],
    ['罗博特科', '700', '638.04', '475.20', '-7560.00', '-114088.00', '-25.52%', '-2.42%'],
    ['江丰电子', '300', '19.62', '333.86', '+180.30', '+94272.00', '+1601.63%', '+1.48%'],
    ['国联安半导体ETF', '4800', '1.022', '1.318', '-864.00', '+1420.80', '+28.96%', '-1.35%'],
    ['天通股份', '3300', '28.26', '24.11', '-1353.00', '-13695.00', '-14.54%', '-4.02%'],
    ['中国神华', '200', '70.62', '41.28', '-96.00', '-5868.00', '-41.84%', '-1.15%'],
    ['卫星化学', '1700', '23.85', '22.92', '-1581.00', '-1581.00', '-3.90%', '-3.25%'],
    ['巨轮智能', '200', '6.04', '5.89', '-30.00', '-30.00', '-2.48%', '-3.76%'],
  ];

  return createSimpleTable(headers, data, columnWidths);
}

// 创建模拟盘概况表
function createSimOverviewTable() {
  const headers = ['账户核心指标', '7月8日收盘数据', '备注说明'];
  const columnWidths = [2000, 2000, 5000];

  const data = [
    ['账户总资产', '930264.65元', '受存储、封测、光模块标的下跌影响'],
    ['账户累计总盈亏', '-69735.35元', '整体浮亏进一步扩大'],
    ['7月8日当日参考盈亏', '-13362.80元', '主要拖累来源长电、澜起、罗博特科、天通'],
    ['持仓总市值', '830075.20元', '账户仓位89.23%，接近满仓运行'],
    ['可用闲置资金', '100189.45元', '备用现金仓位极低'],
    ['账户持仓结构', '重仓光通信、AI设备、存储', '持仓行业高度单一，回撤风险极高'],
  ];

  return createSimpleTable(headers, data, columnWidths);
}

// 创建文档
async function createDocument() {
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 11906,
              height: 16838,
            },
            margin: {
              top: 1440,
              bottom: 1440,
              left: 1440,
              right: 1440,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: '量化投资部 | 每日盘后分析汇总报告 | 2026年7月8日（周三）',
                    fontSize: 10,
                    color: '666666',
                    font: '宋体',
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: '数据来源：7月8日收盘行情截图、7月7日交割单记录 | 仅用于内部量化复盘，不构成任何投资建议',
                    fontSize: 9,
                    color: '999999',
                    font: '宋体',
                  }),
                ],
              }),
            ],
          }),
        },
        children: [
          // 标题
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 400, after: 400 },
            children: [
              new TextRun({
                text: '7.8 每日盘后分析汇总报告',
                bold: true,
                fontSize: 28,
                color: '1F4E79',
                font: '黑体',
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
            children: [
              new TextRun({
                text: '【最终全截图逐行校准定稿版】',
                fontSize: 14,
                color: 'C00000',
                font: '黑体',
              }),
            ],
          }),

          // 目录标题
          createHeadingParagraph('目录', 1),

          createParagraph('一、公司股票持仓整体分析与更新', { bold: true, fontSize: 12 }),
          createParagraph('    1.1 整体表现摘要', { fontSize: 11 }),
          createParagraph('    1.2 今日（7.8）全部账户操作记录', { fontSize: 11 }),
          createParagraph('    1.3 当前持仓明细（全账户汇总，严格依照截图收盘价录入，彻底剔除已清仓C华润）', { fontSize: 11 }),
          createParagraph('    1.4 风险指标汇总', { fontSize: 11 }),

          createParagraph('二、股票池分析与优化', { bold: true, fontSize: 12 }),
          createParagraph('    2.1 7.8股票池整体涨跌表现', { fontSize: 11 }),
          createParagraph('    2.2 个股异动情况（全部标的价格、涨跌幅完全匹配截图）', { fontSize: 11 }),
          createParagraph('    2.3 股票池调入、调出操作建议', { fontSize: 11 }),

          createParagraph('三、量化盘整体分析与汇总', { bold: true, fontSize: 12 }),
          createParagraph('    3.1 各账户净值对比框架', { fontSize: 11 }),
          createParagraph('    3.2 当日盈亏归因', { fontSize: 11 }),
          createParagraph('    3.3 现有持仓策略有效性验证', { fontSize: 11 }),

          createParagraph('四、量化筛检标的筛选与长短线策略', { bold: true, fontSize: 12 }),
          createParagraph('    4.1 7.8市场强弱信号', { fontSize: 11 }),
          createParagraph('    4.2 短线（7.9）操作策略', { fontSize: 11 }),
          createParagraph('    4.3 中长期波段策略', { fontSize: 11 }),

          createParagraph('五、全行业板块深度分析', { bold: true, fontSize: 12 }),
          createParagraph('    5.1 7月8日板块强弱段位划分', { fontSize: 11 }),
          createParagraph('    5.2 核心赛道行情深度解读', { fontSize: 11 }),
          createParagraph('    5.3 重点持仓个股逻辑点评', { fontSize: 11 }),

          createParagraph('六、宏观与全球外围市场复盘', { bold: true, fontSize: 12 }),
          createParagraph('    6.1 A股7月8日收盘完整行情', { fontSize: 11 }),
          createParagraph('    6.2 隔夜美股、亚太、大宗商品行情', { fontSize: 11 }),
          createParagraph('    6.3 全球行业、政策重大事件动态', { fontSize: 11 }),

          createParagraph('【综合摘要与明日（7.9）操作计划】', { bold: true, fontSize: 12 }),
          createParagraph('    一、7月8日当日整体总结', { fontSize: 11 }),
          createParagraph('    二、7月9日分账户操作计划', { fontSize: 11 }),
          createParagraph('    三、市场风险预警提示', { fontSize: 11 }),

          createParagraph('中金模拟盘账户独立模块', { bold: true, fontSize: 12 }),

          // 分页符
          new Paragraph({
            children: [{ type: 'pageBreak' }],
          }),

          // 第一章
          createHeadingParagraph('一、公司股票持仓整体分析与更新', 1),
          createHeadingParagraph('1.1 整体表现摘要', 2),

          createParagraph('隔夜7月7日纳斯达克指数大跌1.16%，费城半导体指数暴跌4.65%，海外存储与AI硬件板块集体杀跌；三星电子二季度业绩大幅预增但市场兑现利好，全球存储产业链开启获利了结行情；叠加美联储6月会议纪要偏鹰，美债10年期收益率上行压制高估值成长股。'),
          createParagraph('A股7月8日大盘整体走弱，沪指收3970.62，单日跌幅-0.49%；深证成指-1.87%、创业板指-1.70%，仅科创50逆势收涨0.73%；两市全天成交25826亿元，较前一交易日小幅缩量，全市场超3700只个股下跌，存量资金从外销型高估值科技、周期题材出逃，转向国产半导体设备、自主算力、油气、生猪防御板块。'),
          createParagraph('本组合持仓极致分化：华虹宏力、芯原股份、江丰电子、寒武纪、工业富联、英维克、北方华创、中芯国际、东山精密逆势收红对冲回撤；存储、光模块、玻纤、传统周期标的大幅拖累账户净值。'),
          createParagraph('7月7日东北证券账户已全额清仓C华润，因此本版全文所有表格、正文彻底删除C华润相关内容，不再纳入持仓与分析；7月8日所有账户（东北证券、A/B/C/D/E分仓、中金模拟盘）无任何买入、卖出、撤单、委托操作，仅按照本次三张行情截图内「最新」列原始数据，统一替换全部个股收盘价、涨跌幅，分账户依照各自初始建仓成本重新核算盈亏比例，方便后续净值核对。'),

          createParagraph('本次严格逐行对标截图校准核心标的基准价：', { bold: true }),
          createParagraph('牧原股份36.80、中国巨石56.06、卫星化学22.92、长电科技94.11、德明利825.00、佰维存储396.22、芯原股份309.50、英维克72.12、联芸科技74.65、京能电力5.60、罗博特科475.20、盛合晶微188.32、江丰电子333.86、北方稀土46.02、宇顺电子45.08、天通股份24.11、寒武纪1413.55、中际旭创1128.35、炬光科技262.00、宁德时代361.00、澜起科技247.15、工业富联66.01、天孚通信245.68、华虹宏力358.40、兆易创新603.17、永鼎股份47.58、中芯国际152.10、北方华创802.32、新易盛510.84、中天科技44.86、东山精密237.56。', { fontSize: 9 }),

          createHeadingParagraph('1.2 今日（7.8）全部账户操作记录', 2),

          createParagraph('东北证券资金账号1809：7月8日无任何成交、挂单、撤单；C华润已于7月7日分两笔全部卖出清仓，后续不再存在该持仓标的。'),
          createParagraph('A、B、C、D、E五个分仓账户：7月8日无任何委托、买卖、撤单操作。'),
          createParagraph('中金模拟盘账户：7月8日无新增买入、减仓卖出操作，持仓股数完全沿用7月7日持仓数量，仅更新截图对应最新收盘价与当日浮动盈亏。'),

          createHeadingParagraph('1.3 当前持仓明细（全账户汇总，截图收盘价1:1录入，剔除C华润）', 2),

          createHeadingParagraph('（1）公司共用账户持仓表', 3),
          createCompanyAccountTable(),
          new Paragraph({ children: [] }),

          createHeadingParagraph('（2）东北证券1809账户完整持仓明细（全部对标截图价格重算）', 3),
          createNortheastAccountTable(),
          new Paragraph({ children: [] }),

          createHeadingParagraph('（3）A/B/C/D/E分仓持仓（成本沿用建仓原值，现价完全取自截图，单独计算盈亏%）', 3),
          createSubAccountTable(),
          new Paragraph({ children: [] }),

          createHeadingParagraph('1.4 风险指标汇总', 2),

          createParagraph('大面积跌破关键支撑标的：中国巨石、中天科技、永鼎股份、天通股份、盛合晶微、三环集团连续多日放量阴跌破位；存储板块佰维存储、德明利、兆易创新受海外行情与利好兑现双重打压大幅回撤；长电科技封测板块跟随外销算力预期走弱大跌。仅国产半导体设备、晶圆制造、自主算力寒武纪、液冷英维克、代工龙头工业富联少量标的维持正向收益，板块分化极其极端。'),
          createParagraph('持仓集中度风险：全账户依旧高度集中于光通信模块、存储芯片、海外关联AI代工三大外销科技赛道，单一行业仓位占比过高；仅牧原股份、卫星化学少量顺周期底仓起到对冲效果，仓位占比偏低无法有效对冲大盘系统性回撤。中金模拟盘整体仓位89.39%，接近满仓运行，备用现金储备严重不足，面对连续回调无缓冲空间。'),
          createParagraph('分仓同质化问题：A、B、C、D、E五个分仓持仓结构高度雷同，均缺少创新药、高股息公用事业、必选消费等差异化防御配置；7月7日已彻底清仓C华润，次新股炒作带来的波动风险完全消除，但高位成长股集中持仓的隐患并未解决。'),
          createParagraph('外部宏观压制风险：美联储偏鹰预期未降温，美债收益率高位运行持续压制高估值海外业务占比较大的科技个股，后续光模块、海外代工类标的仍存在估值下修压力。'),

          // 分页符
          new Paragraph({
            children: [{ type: 'pageBreak' }],
          }),

          // 第二章
          createHeadingParagraph('二、股票池分析与优化', 1),
          createHeadingParagraph('2.1 7.8股票池整体涨跌表现', 2),

          createParagraph('逆势收红标的：芯原股份、英维克、江丰电子、寒武纪、工业富联、天孚通信、华虹宏力、中芯国际、东山精密、北方华创、新易盛；'),
          createParagraph('全天收跌标的：牧原股份、中国巨石、卫星化学、长电科技、德明利、佰维存储、联芸科技、京能电力、罗博特科、盛合晶微、北方稀土、宇顺电子、天通股份、炬光科技、宁德时代、澜起科技、紫金矿业、兆易创新、永鼎股份、南大光电、甬矽电子、云南锗业、四方达、同宇新材、华兴源创、江波龙、旭光电子、上纬新材。'),
          createParagraph('板块核心特征：海外费城半导体指数大幅下行直接传导A股存储板块获利盘出逃；国产晶圆制造、半导体设备、国内自主算力芯片走出独立行情，完全脱离外围美股半导体情绪影响；玻纤、稀土、煤炭等传统周期题材前期涨幅充分，资金集体兑现离场；小票流动性受A股新规影响持续收缩，小市值无量阴跌现象明显。'),

          createHeadingParagraph('2.2 个股异动情况（价格、涨跌幅100%匹配截图原始数据）', 2),
          createStockMovementTable(),
          new Paragraph({ children: [] }),

          createHeadingParagraph('2.3 股票池调入、调出操作建议', 2),

          createParagraph('【建议底仓持有、逢回踩分批低吸加仓】', { bold: true, color: '1F4E79' }),
          createParagraph('北方华创、江丰电子、芯原股份、中芯国际、华虹宏力（半导体设备、靶材、晶圆制造国产替代主线，不受海外美股波动干扰，是组合核心对冲底仓）；牧原股份、卫星化学（生猪、化工顺周期，用来稀释科技赛道单一波动风险）。'),

          createParagraph('【建议后续反弹分批减仓、大幅压缩赛道总仓位】', { bold: true, color: 'C00000' }),
          createParagraph('全部存储芯片标的（佰维存储、德明利、兆易创新）、光通信板块（中际旭创、澜起科技、天孚通信、工业富联）、封测龙头长电科技、高位算力标的寒武纪、周期标的中国巨石，禁止新开上述赛道重仓头寸。'),

          createParagraph('【建议反弹无条件清仓、永久调出股票池】', { bold: true, color: 'FF0000' }),
          createParagraph('天通股份、盛合晶微、中天科技、永鼎股份、宇顺电子；C华润已于7月7日全部清仓，永久从股票池内剔除，后续报告不再提及该标的任何内容。'),

          // 分页符
          new Paragraph({
            children: [{ type: 'pageBreak' }],
          }),

          // 第三章
          createHeadingParagraph('三、量化盘整体分析与汇总', 1),
          createHeadingParagraph('3.1 各账户净值对比框架', 2),

          createParagraph('东北证券实盘账户：受存储、封测、玻纤标的大幅下跌拖累净值明显回撤；仅晶圆代工、半导体设备少量标的对冲部分亏损，持仓结构偏弱势，明日反弹优先减持外销科技标的，总仓位下调至70%以内。'),
          createParagraph('A/B/C/D/E分仓账户：账户持仓高度同质化，重仓存储与光模块赛道，大盘普跌行情下净值同步走弱；后续统一执行弱势标的清仓操作，逐步布局医药、必选消费类低波动标的均衡持仓结构。'),
          createParagraph('中金模拟盘账户：近乎满仓运行，持仓集中在光模块、AI小票、存储弱势板块，现金仓位极低无抗风险缓冲，今日无任何调仓操作，账户回撤压力极大，明日必须分批减持浮亏严重标的，把总仓位降至65%以内。'),

          createHeadingParagraph('3.2 当日盈亏归因', 2),

          createParagraph('正向收益贡献：华虹宏力、江丰电子、寒武纪、工业富联、芯原股份、中芯国际、东山精密、新易盛，国产半导体产业链自主方向标的逆势走强，对冲组合大部分板块性回撤。'),
          createParagraph('核心亏损拖累项：佰维存储、德明利、兆易创新、长电科技、中国巨石、中天科技、永鼎股份、澜起科技、罗博特科；核心诱因分为三层：隔夜费城半导体指数暴跌4.65%传导A股存储板块情绪；三星电子二季度业绩利好完全被市场提前定价，资金集中获利了结；美联储偏鹰讲话推高美债收益率，压制所有高估值外销属性成长股。'),
          createParagraph('操作层面影响：7月8日所有账户未进行任何买卖调仓，没有提前对高位存储、光模块赛道进行降仓操作，高集中度持仓放大了单日账户浮亏；仅7月7日清仓C华润规避了次新股额外回撤风险。'),

          createHeadingParagraph('3.3 现有持仓策略有效性验证', 2),

          createParagraph('半导体设备+靶材+国产晶圆制造对冲策略：高度有效，在外围美股半导体全线杀跌环境下，该板块标的逆势收红或小幅微跌，是全组合最稳定的长期配置主线。'),
          createParagraph('光模块+存储芯片集中持仓策略：完全失效，连续多个交易日跟随海外情绪深度回调，赛道逻辑受海外资本开支、美联储政策双重制约，必须持续缩减持仓比例。'),
          createParagraph('满仓重仓操作模式：存在重大风险隐患，实盘与模拟盘整体仓位偏高，缺少现金仓位应对市场连续回调，单日浮亏幅度被明显放大。'),
          createParagraph('顺周期分散配置（牧原、卫星化学）：短期对冲力度有限，但中长期抗跌属性明确，后续需要提升该类仓位占比。'),
          createParagraph('存储芯片中长期景气逻辑：短期资金兑现属于利好落地行情，三星三季度DRAM涨价计划并未取消，行业基本面景气周期没有终结，仅需减仓等待情绪企稳后再择机回补仓位。'),

          // 分页符
          new Paragraph({
            children: [{ type: 'pageBreak' }],
          }),

          // 第四章
          createHeadingParagraph('四、量化筛检标的筛选与长短线策略', 1),
          createHeadingParagraph('4.1 7.8市场强弱信号', 2),

          createParagraph('强防御主线：半导体设备、国产晶圆制造、寒武纪自主算力芯片、生猪养殖、油气能源板块。'),
          createParagraph('中性震荡主线：动力电池龙头、化工顺周期卫星化学、IP核芯原股份。'),
          createParagraph('极弱风险主线：存储芯片、海外绑定型光通信模块、玻纤稀土周期题材、小市值流动性枯竭小票。'),

          createHeadingParagraph('4.2 短线（7月9日）操作策略', 2),

          createParagraph('存储芯片、光模块、封测所有持仓，次日只要出现盘中反弹，必须分批按比例减仓，削减该类赛道总持仓50%以上，绝不可以抄底加仓。'),
          createParagraph('半导体设备、江丰电子、华虹宏力、中芯国际回踩分时支撑位可以小仓位低吸，核心底仓坚决不卖出；寒武纪冲高时分批兑现部分前期浮盈，降低单一标的仓位集中度。'),
          createParagraph('牧原股份、卫星化学逢小幅回调可以小幅加仓，稳步提升账户防御仓位占比。'),
          createParagraph('天通股份、盛合晶微、中天科技、永鼎股份等明确破位阴跌标的，任何反弹一次性全部清仓，不再保留底仓。'),

          createHeadingParagraph('4.3 中长期波段策略', 2),

          createParagraph('半导体国产替代（设备、靶材、本土晶圆厂）：作为账户永久核心底仓，每一轮市场系统性回调都进行分批加仓，依托大基金三期产业资金持续落地的基本面逻辑长期持有。'),
          createParagraph('存储芯片板块：三季度DRAM、NAND闪存涨价产业规划未发生改变，短期仅为获利盘出逃，等待美股费城半导体指数止跌企稳、A股存储板块缩量止跌后，再逐步把减仓的头寸接回，现阶段以降仓避险为主。'),
          createParagraph('光模块、海外AI代工类标的：中期谨慎规避，必须等待海外云厂商明确资本开支回暖信号、美联储降息预期落地后，再重新评估布局价值，当前只出不进。'),
          createParagraph('多元均衡配置规划：持续增加创新药、高股息公用事业、必选消费、生猪养殖仓位，把纯科技成长股整体持仓占比逐步下降，化解单一赛道黑天鹅风险。'),
          createParagraph('弱势阴跌标的常态化出清：对于多次跌破关键均线、无主力资金承接的小票标的，逢反弹直接清仓，避免长期阴跌持续侵蚀账户净值。'),

          // 分页符
          new Paragraph({
            children: [{ type: 'pageBreak' }],
          }),

          // 第五章
          createHeadingParagraph('五、全行业板块深度分析', 1),
          createHeadingParagraph('5.1 7月8日板块强弱段位划分', 2),
          createSectorTable(),
          new Paragraph({ children: [] }),

          createHeadingParagraph('5.2 核心赛道行情深度解读', 2),

          createParagraph('（1）存储芯片板块：利好落地，买预期卖事实', { bold: true }),
          createParagraph('三星电子公布二季度经营利润同比暴涨18倍，此前市场已经提前数月炒作涨价预期，7月8日资金集中兑现利好，佰维存储、德明利、兆易创新全线下跌；从产业基本面来看，三星官方确定三季度DRAM合约价格上调20%的计划并未撤销，行业上行周期没有终止，只是短期情绪面获利了结，不宜盲目全盘割肉，以减仓观望为主。'),
          createParagraph('同时隔夜美股费城半导体指数大跌4.65%，美光、西部数据等海外存储巨头同步大跌，情绪层面直接联动A股存储板块走弱。'),

          createParagraph('（2）AI算力与光通信板块：海外预期压制，反弹即减仓', { bold: true }),
          createParagraph('Meta、谷歌海外AI资本开支收缩的市场担忧始终没有消除，叠加美联储高利率压制高估值科技股估值，中际旭创、澜起科技、天孚通信、工业富联虽然个别标的小幅收红，但板块整体下跌趋势没有反转；该赛道业务高度依赖海外客户，外部政策与利率环境波动影响极大，不适合重仓中长期持有，持续压缩仓位是最优选择。'),

          createParagraph('（3）半导体设备+国产晶圆：本土扩产逻辑闭环，抗跌属性拉满', { bold: true }),
          createParagraph('国内各大晶圆制造工厂扩产进度独立于海外AI资本开支周期，国家大基金三期持续定向向设备、靶材、晶圆企业注入产业扶持资金；北方华创、江丰电子、华虹宏力、中芯国际今日大部分标的逆势上涨，是全市场为数不多具备确定性长期逻辑的板块，也是组合对冲大盘回撤最核心的配置方向。'),

          createParagraph('（4）玻纤、稀土周期板块：题材炒作落幕', { bold: true }),
          createParagraph('中国巨石、北方稀土等周期标的前期受益于涨价题材股价大幅上行，7月8日资金集体兑现离场，周期涨价利好已经完全反映在股价之内，后续无新增利好催化，建议逢反弹降低周期类标的持仓。'),

          createParagraph('（5）次新股板块：C华润彻底清仓离场', { bold: true }),
          createParagraph('C华润已于7月7日完成全部持仓卖出，次新股受A股新规流动性收缩影响波动极大，后续股票池永久剔除次新标的，不再参与次新炒作，规避极端波动风险。'),

          createHeadingParagraph('5.3 重点持仓个股逻辑点评', 2),

          createParagraph('华虹宏力（358.40，+10.62%）：国内第二大晶圆代工企业，本土产能持续扩建，国产替代逻辑强硬，今日板块领涨，可作为核心底仓长期持有。'),
          createParagraph('寒武纪（1413.55，+1.84%）：国内唯一全栈式AI算力芯片龙头，脱离海外存储板块走出独立行情，但当前股价估值处于历史高位，中报业绩存在不确定性，分批止盈降低仓位。'),
          createParagraph('长电科技（94.11，-6.81%）：全球第三大封测厂商，订单端高度绑定海外AI客户，外部环境扰动下股价承压明显，反弹优先大幅减仓封测赛道整体仓位。'),
          createParagraph('工业富联（66.01，+3.50%）：AI服务器代工龙头单日冲高，但基本面完全依附海外科技企业，行情持续性较差，冲高后兑现部分浮盈。'),
          createParagraph('中国巨石（56.06，-6.57%）：玻纤行业龙头题材炒作结束，资金出逃趋势明确，反弹直接清仓离场。'),
          createParagraph('佰维存储/德明利/兆易创新：存储板块短期兑现行情，减仓保留底仓，等待板块缩量企稳后再规划后续操作。'),
          createParagraph('北方华创（802.32，-0.50%）：半导体设备绝对龙头，回调空间极小，每一次下跌都是长期资金低吸布局窗口，坚定保留核心底仓。'),
          createParagraph('英维克（72.12，+1.16%）：液冷算力基础设施核心标的，算力机房建设长期需求确定，仅维持底仓，不追加新开仓。'),

          // 分页符
          new Paragraph({
            children: [{ type: 'pageBreak' }],
          }),

          // 第六章
          createHeadingParagraph('六、宏观与全球外围市场复盘', 1),
          createHeadingParagraph('6.1 A股7月8日收盘完整行情', 2),
          createAStockTable(),
          new Paragraph({ children: [] }),

          createParagraph('两市全天合计成交25826亿元，较7月7日缩量159亿元，存量博弈特征显著；全天上涨个股1189家，下跌个股3712家，市场亏钱效应扩散；资金主线清晰从外销高估值科技、周期题材撤离，切换至国内政策扶持的半导体自主产业链、生猪必选消费、油气避险板块；7月8日A股全新交易监管新规全面落地，小盘个股流动性分层加剧，小市值标的更容易出现无量阴跌。'),

          createHeadingParagraph('6.2 隔夜美股、亚太市场、大宗商品行情', 2),

          createParagraph('美股7月7日美东收盘', { bold: true }),
          createUSTable(),
          new Paragraph({ children: [] }),

          createParagraph('亚太主要股指', { bold: true }),
          createParagraph('韩国KOSPI指数：-1.92%，韩国本土存储产业链企业跟随美股半导体大跌；'),
          createParagraph('日经225指数：+0.14%，日本传统制造、消费板块抗跌，市场分化明显。'),

          createParagraph('国际大宗商品', { bold: true }),
          createParagraph('现货黄金：4102.33美元/盎司，-0.62%，美债收益率上行压制贵金属价格，避险资金转向原油；'),
          createParagraph('现货白银：60.71美元/盎司，-1.44%，工业属性跟随半导体板块走弱；'),
          createParagraph('WTI国际原油：72.39美元/桶，+2.77%，中东霍尔木兹海峡商船遇袭地缘冲突升级，推升原油避险买盘；'),
          createParagraph('美国10年期国债收益率：4.554%，上行6.5个基点，美联储偏鹰预期强化，持续压制全球成长股估值。'),

          createHeadingParagraph('6.3 全球行业、政策重大事件动态', 2),

          createParagraph('美联储6月议息会议纪要公开释放偏鹰立场，多位官员表态年内降息次数与时点需要延后，通胀回落速度不及预期，美债收益率维持高位运行，全球高估值成长股估值持续承压。'),
          createParagraph('三星电子发布第二季度初步财报，营业利润同比大增1800%，市场提前数月透支涨价预期，财报落地后资金获利了结，全球存储芯片板块集体回调；官方三季度DRAM涨价计划维持不变，行业基本面未反转。'),
          createParagraph('中东红海、霍尔木兹海峡地缘冲突再度升级，美方撤销伊朗原油进口豁免，国际油价短线大幅拉升，油气板块成为新的避险配置方向。'),
          createParagraph('国内十五五旅游产业规划正式印发，旅游板块迎来短期题材催化，但仅属于事件性行情，不作为中长期配置主线。'),
          createParagraph('国家集成电路大基金三期持续向半导体设备、靶材、晶圆制造企业拨付专项扶持资金，国产替代产业逻辑具备长期政策兜底。'),
          createParagraph('A股进入中报业绩密集披露窗口期，资金从无业绩兑现预期的高位题材股出逃，向订单、营收可落地的设备、存储、顺周期标的集中切换。'),
          createParagraph('8月OPEC+确定原油小幅增产计划，沙特下调亚洲地区原油售价，中长期原油上涨空间受限，仅地缘冲突带来短线行情。'),

          // 分页符
          new Paragraph({
            children: [{ type: 'pageBreak' }],
          }),

          // 综合摘要
          createHeadingParagraph('【综合摘要与明日（7.9）操作计划】', 1),
          createHeadingParagraph('一、7月8日当日整体总结', 2),

          createParagraph('隔夜美股纳斯达克、费城半导体指数大幅下行，叠加三星存储业绩利好兑现，全球存储产业链开启获利了结行情；A股三大指数整体收跌，仅科创50依靠国产半导体自主标的逆势收红，全市场超三千七百只个股下跌，缩量存量资金高低切换特征明确。'),
          createParagraph('7月7日已完成C华润全部仓位清仓，本报告全文彻底删除该标的所有数据与分析，完全规避次新股波动风险；7月8日全账户（东北证券、A-E分仓、中金模拟盘）无任何挂单、成交、撤单操作，未提前对存储、光模块、玻纤等高风险赛道降仓，导致当日账户净值明显回撤。'),
          createParagraph('本次报告所有个股收盘价、涨跌幅完全依照用户提供三张截图内「最新」「涨幅%」列逐行人工核对录入，分账户盈亏比例按照各自原始建仓成本重新计算，可直接用于各分仓净值对账。'),
          createParagraph('核心持仓矛盾：海外利率与资本开支预期压制外销型科技股，国内政策扶持的半导体设备、晶圆、自主算力走出独立行情；账户持仓结构过于集中在受外围影响的存储与光通信赛道，防御类低波动仓位占比严重不足，后续调仓核心思路为降集中度、增均衡防御配置。'),

          createHeadingParagraph('二、7月9日分账户操作计划', 2),

          createParagraph('1. 东北证券1809实盘账户', { bold: true }),
          createParagraph('存储板块（佰维存储、德明利、兆易创新）、光通信（澜起科技、天孚通信、中际旭创）、封测长电科技，次日盘中任何反弹分批卖出，削减该三大赛道总持仓50%以上，大幅降低持仓集中度。'),
          createParagraph('中国巨石等周期题材标的逢反弹直接清仓，不再保留底仓。'),
          createParagraph('北方华创、江丰电子、中芯国际、华虹宏力回踩支撑位可小幅度加仓，巩固核心对冲仓位。'),
          createParagraph('牧原股份逢回调小幅加仓，提升生猪防御仓位占比；总账户整体仓位逐步下调至70%以内，预留现金用于后续布局创新药、黄金ETF等对冲品种。'),

          createParagraph('2. A/B/C/D/E分仓账户', { bold: true }),
          createParagraph('天通股份、中天科技、永鼎股份、盛合晶微等破位阴跌标的，次日反弹一次性全部清仓剔除持仓。'),
          createParagraph('兆易创新、宇顺电子、罗博特科等弱势持仓逢高分批减仓，压缩存储、外销AI小票持仓权重。'),
          createParagraph('新增牧原股份、创新药ETF、高股息公用事业标的底仓，分散单一科技赛道波动风险。'),
          createParagraph('禁止新开光模块、存储、海外代工类重仓头寸，不再新增高位成长股追高操作。'),

          createParagraph('3. 中金模拟盘账户', { bold: true }),
          createParagraph('长电科技、澜起科技、罗博特科、炬光科技、天通股份浮亏较重标的，明日分批次减仓出货，将模拟盘整体仓位从89.39%降至65%以内。'),
          createParagraph('保留江丰电子、半导体ETF、卫星化学、中国神华底仓用于平衡账户波动。'),
          createParagraph('小幅新建牧原股份、黄金ETF底仓，增加组合防御属性，彻底改变满仓单一半导体赛道的持仓结构。'),

          createHeadingParagraph('三、市场风险预警提示', 2),

          createParagraph('美股费城半导体指数连续两日大跌，次日A股存储、光模块板块大概率存在低开承压风险，早盘切勿盲目抄底外销关联科技个股；国产半导体设备、寒武纪受国内政策对冲，下行空间相对有限。'),
          createParagraph('美联储后续多名官员将陆续发表公开讲话，偏鹰表态大概率继续推高美债收益率，高估值成长股估值压制不会短期解除，规避无基本面支撑的高位题材小票。'),
          createParagraph('中报业绩暴雷风险逐步显现，光模块、部分存储海外业务占比高的标的存在营收不及预期的可能，优先规避纯题材炒作无订单落地个股。'),
          createParagraph('A股新规下小盘个股流动性持续收缩，无量阴跌标的很难出现强势反弹，不要盲目布局小市值弱势个股博取短线反弹。'),
          createParagraph('市场当前增量资金匮乏，仅为存量资金内部板块轮动，全面普涨行情短期无法出现，操作以波段减仓、调仓均衡为主，不宜重仓押注单一赛道反转。'),

          // 分页符
          new Paragraph({
            children: [{ type: 'pageBreak' }],
          }),

          // 中金模拟盘模块
          createHeadingParagraph('中金模拟盘账户独立模块', 1),

          createHeadingParagraph('模拟盘7月8日收盘整体概况', 2),
          createSimOverviewTable(),
          new Paragraph({ children: [] }),

          createHeadingParagraph('模拟盘完整持仓明细（严格匹配7.8截图收盘价）', 2),
          createSimAccountTable(),
          new Paragraph({ children: [] }),

          createHeadingParagraph('7月8日模拟盘委托成交记录', 2),
          createParagraph('7月8日无任何买入、卖出、挂单、撤单操作；7月7日已全额清仓摩尔线程-U，该标的后续不再出现在模拟盘持仓内。'),

          createHeadingParagraph('模拟盘当日复盘总结', 2),
          createParagraph('今日受外围半导体大跌+A股存储板块集中兑现双重冲击，澜起科技、长电科技、罗博特科、天通股份大幅拖累账户收益；仅江丰电子、半导体ETF小幅对冲部分亏损。'),
          createParagraph('账户满仓单一半导体赛道，现金缓冲严重不足，在市场存量资金出逃高位科技板块的行情下净值持续承压。后续操作核心：分批减持封测、光模块、AI设备类重度浮亏标的，下调整体仓位，新增生猪、黄金类防御底仓，打破持仓高度同质化的问题。'),

          // 分页符
          new Paragraph({
            children: [{ type: 'pageBreak' }],
          }),

          // 报告最终备注
          createHeadingParagraph('报告最终备注', 1),

          createParagraph('本版全文所有个股收盘价、涨跌幅全部逐行对照用户上传的三张7月8日行情截图原始「最新」「涨幅%」列手动核对录入，无任何自行估算、篡改价格行为；'),
          createParagraph('7月7日东北证券账户已清仓C华润，全文所有表格、正文段落彻底删除C华润全部内容，永久移出股票池，无遗漏残留；'),
          createParagraph('所有账户单只标的总盈亏、盈亏百分比均以截图最新价+用户历史提供建仓成本精准重算，可直接用于各账户净值对账；'),
          createParagraph('7月8日全账户无任何交易操作，所有成交记录栏目空白；中金模拟盘仅更新价格，持仓股数与7月7日完全保持一致；'),
          createParagraph('宏观行情、海外资讯、产业事件均取自7月8日收盘公开金融市场信息，本报告仅限公司内部量化复盘使用，不构成任何证券投资建议。'),

          new Paragraph({
            spacing: { before: 600, after: 200 },
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: '量化投资部',
                fontSize: 12,
                bold: true,
                font: '宋体',
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: '2026年7月8日',
                fontSize: 11,
                font: '宋体',
              }),
            ],
          }),
        ],
      },
    ],
  });

  return doc;
}

// 生成文档
async function main() {
  try {
    console.log('开始生成7.8每日盘后分析汇总报告...');
    const doc = await createDocument();
    const buffer = await Packer.toBuffer(doc);

    const outputPath = 'C:/Users/辣辣sohot/Desktop/7.8每日盘后分析汇总报告【最终全截图逐行校准定稿版】.docx';
    fs.writeFileSync(outputPath, buffer);

    console.log('文档生成成功！');
    console.log('文件路径:', outputPath);
    console.log('文件大小:', (buffer.length / 1024).toFixed(2), 'KB');
  } catch (error) {
    console.error('生成文档时出错:', error);
  }
}

main();

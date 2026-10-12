"""Create a fictional, public-safe reading sample for product screenshots."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import fitz

output = Path(__file__).resolve().parents[1] / "release" / "promotion"
output.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(TTFont("DemoChinese", "C:/Windows/Fonts/msyh.ttc", subfontIndex=0))
pdf = output / "reading-demo.pdf"
c = canvas.Canvas(str(pdf), pagesize=(595, 842))
c.setTitle("文献阅读示例 - ResearchMind 枝间")
c.setAuthor("ResearchMind Demo")
c.setFillColorRGB(.22, .34, .28)
c.setFont("DemoChinese", 12)
c.drawString(48, 787, "ResearchMind 枝间  /  阅读示例")
c.setFont("DemoChinese", 24)
c.drawString(48, 739, "把阅读变成自己的知识")
c.setFillColorRGB(.42, .46, .43)
c.setFont("DemoChinese", 10)
c.drawString(48, 711, "以下内容为演示编写，不是真实论文或研究结论。")
c.setStrokeColorRGB(.80, .85, .81)
c.line(48, 692, 547, 692)
sections = [
    ("01  阅读目标", ["阅读一份资料时，先确定想解决的问题。", "将背景、方法和发现分别整理，方便回顾。"]),
    ("02  关键观点", ["将关键观点整理成节点，建立清晰的知识结构。", "将 PDF 与导图关联，方便回到原文核对。"]),
    ("03  后续问题", ["哪些观点还需要进一步验证？", "把疑问记在导图里，作为下一轮阅读的线索。"]),
]
y = 652
for heading, lines in sections:
    c.setFillColorRGB(.22, .34, .28)
    c.setFont("DemoChinese", 15)
    c.drawString(48, y, heading)
    y -= 34
    c.setFillColorRGB(.23, .26, .24)
    c.setFont("DemoChinese", 12)
    for line in lines:
        c.drawString(48, y, line)
        y -= 27
    y -= 30
c.setFillColorRGB(.42, .46, .43)
c.setFont("DemoChinese", 10)
c.drawString(48, 50, "虚构示例 · 不含个人资料                         1 / 1")
c.save()
with fitz.open(pdf) as document:
    assert len(document) == 1
    assert "关键观点" in document[0].get_text()
    document[0].get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(str(output / "reading-demo-preview.png"))
print(pdf)

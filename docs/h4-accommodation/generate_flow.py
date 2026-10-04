"""Generate standalone SVG flow diagrams for the agreed H4 design."""
from html import escape
from pathlib import Path
import textwrap

HERE = Path(__file__).parent
WIDTH = 1800
COLORS = {
    'blue': ('#edf3fb', '#3c658f', '#213e60'),
    'green': ('#e8f4ee', '#3e826a', '#1e5844'),
    'amber': ('#fff4df', '#bc8a3d', '#805019'),
    'red': ('#fbecec', '#bb6262', '#893838'),
    'neutral': ('#f5f7fa', '#bac8d4', '#31465b'),
}


class Diagram:
    def __init__(self, number, title, subtitle, height):
        self.number, self.title, self.height = number, title, height
        self.nodes, self.edges = [], []
        self.nodes.append(f'<rect width="{WIDTH}" height="{height}" fill="#ffffff"/>')
        self.nodes.append(f'<rect x="32" y="28" width="1736" height="{height-56}" rx="20" fill="#fff" stroke="#d8e2ec" stroke-width="2"/>')
        self.nodes.append(f'<rect x="60" y="55" width="55" height="55" rx="12" fill="#244a76"/><text x="87" y="91" text-anchor="middle" font-size="25" font-weight="700" fill="white">{number:02}</text>')
        self.nodes.append(f'<text x="135" y="80" font-size="30" font-weight="700" fill="#182d42">{escape(title)}</text><text x="135" y="108" font-size="17" fill="#61768a">{escape(subtitle)}</text>')

    def node(self, x, y, w, h, title, lines=(), tone='blue', tag=None):
        bg, stroke, ink = COLORS[tone]
        parts = [f'<g><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="13" fill="{bg}" stroke="{stroke}" stroke-width="2"/>']
        lines = list(lines)
        title_lines = textwrap.wrap(title, max(18, int((w-38)/12)))
        content = [(t, 22, '700') for t in title_lines]
        for line in lines:
            content.extend((t, 18, '400') for t in textwrap.wrap(line, max(22, int((w-38)/9.4))))
        total = sum(size+9 for _,size,_ in content)
        while total > h-10 and min(size for _,size,_ in content) > 15:
            content = [(text, size-1, weight) for text,size,weight in content]
            total = sum(size+9 for _,size,_ in content)
        if total > h-10:
            raise ValueError(f'Node text too tall: {title} ({total} > {h-10})')
        yy = y + (h-total)/2 + 20
        for text, size, weight in content:
            parts.append(f'<text x="{x+w/2}" y="{yy}" text-anchor="middle" fill="{ink}" font-size="{size}" font-weight="{weight}">{escape(text)}</text>')
            yy += size+9
        if tag:
            parts.append(f'<text x="{x+10}" y="{y-10}" fill="{ink}" font-size="13" font-weight="700">{escape(tag)}</text>')
        parts.append('</g>')
        self.nodes.append(''.join(parts))

    def decision(self, cx, cy, w, h, lines):
        self.nodes.append(f'<polygon points="{cx},{cy-h/2} {cx+w/2},{cy} {cx},{cy+h/2} {cx-w/2},{cy}" fill="#fff8e9" stroke="#b78b43" stroke-width="2"/>')
        yy = cy-(len(lines)-1)*13+6
        for line in lines:
            self.nodes.append(f'<text x="{cx}" y="{yy}" text-anchor="middle" font-size="19" font-weight="600" fill="#77531d">{escape(line)}</text>')
            yy += 26

    def edge(self, points, label=None, label_at=None, tone='blue', dashed=False):
        color = {'blue':'#6885a3','green':'#438568','red':'#b86b6b','amber':'#ba924c'}[tone]
        coords = ' '.join(f'{x},{y}' for x,y in points)
        dash = ' stroke-dasharray="8 7"' if dashed else ''
        self.edges.append(f'<polyline points="{coords}" fill="none" stroke="{color}" stroke-width="2.5" stroke-linejoin="round" marker-end="url(#arrow-{tone})"{dash}/>')
        if label and label_at:
            x,y = label_at
            w = len(label)*9.2+22
            self.nodes.append(f'<rect x="{x-w/2}" y="{y-16}" width="{w}" height="29" rx="6" fill="white"/><text x="{x}" y="{y+5}" text-anchor="middle" font-size="16" fill="{color}" font-weight="600">{escape(label)}</text>')

    def footer(self, text):
        self.nodes.append(f'<text x="70" y="{self.height-47}" font-size="16" fill="#61768a">{escape(text)}</text>')

    def body(self):
        return ''.join(self.nodes[:2] + self.edges + self.nodes[2:])

    def svg(self):
        return svg_document(self.body(), self.height, self.title)


def defs():
    out = ['<defs>']
    for name, color in [('blue','#6885a3'),('green','#438568'),('red','#b86b6b'),('amber','#ba924c')]:
        out.append(f'<marker id="arrow-{name}" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L8,4 L0,8 Z" fill="{color}"/></marker>')
    return ''.join(out)+'</defs>'


def svg_document(body, height, title):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{height}" viewBox="0 0 {WIDTH} {height}" role="img" aria-labelledby="diagram-title"><title id="diagram-title">{escape(title)}</title>{defs()}<g font-family="DejaVu Sans, Arial, sans-serif">{body}</g></svg>'


d1 = Diagram(1, 'Creation, faculty recommendation & approval', 'Confirmed: IIT requester/faculty email · external intern email allowed · no extra HoD approval', 1350)
d1.node(655,150,490,115,'Institutional requester signs in',['IIT student / staff / Academics user','Requester email must be @iiti.ac.in'], tag='CREATOR')
d1.node(655,310,490,140,'Batch: one request per student',['Identity / institute / course / contact / stay','Concerned faculty; payer = intern / faculty','Validate every row; retry-safe submission'], tag='CREATOR')
d1.edge([(900,265),(900,310)])
d1.decision(900,550,340,150,['Academics user is','the selected faculty','& submits directly?'])
d1.edge([(900,450),(900,475)])
d1.node(65,485,440,135,'Record faculty recommendation',['Own faculty selection; submit-and-recommend','Confirm details, stay and payer'], tone='green',tag='ACADEMICS')
d1.edge([(730,550),(505,550)],'Yes',(620,530),tone='green')
d1.node(1295,480,440,145,'Selected Academics user reviews',['role = Academics; @iiti.ac.in email','Recommend selected / return / decline','Verify who pays for each student'],tag='ACADEMICS')
d1.edge([(1070,550),(1295,550)],'No: other creator',(1180,530))
d1.node(655,720,490,135,'Check accommodation feasibility',['Review dates, hostel options & room conflicts','Recommend / return / reject per student','No empty-room threshold blocks H4'],tag='CW OFFICE')
d1.edge([(285,620),(285,675),(900,675),(900,720)],'Recommendation recorded',(540,655),tone='green')
d1.edge([(1515,625),(1515,690),(960,690),(960,720)],'Recommended + payer verified',(1310,670),tone='green')
d1.node(65,750,440,130,'All rooms can be considered',['Resident allocation ≠ physical presence','Guest/intern overlap stays advisory','Occupancy does not hard-block H4'],tone='amber')
d1.edge([(505,810),(655,810)],'Room evidence',(580,787),tone='amber',dashed=True)
d1.node(655,930,490,130,'Chief Warden decides',['Approve / return / reject per student','Faculty and CW Office decisions visible','Explicit approval; no H4 auto-timeout'],tag='CHIEF WARDEN')
d1.edge([(900,855),(900,930)],'CW Office recommends',(900,892))
d1.node(655,1140,490,115,'Approved → prepare the offer',['Continue to flow 02','No repeated faculty approval in the normal path'],tone='green')
d1.edge([(900,1060),(900,1140)],'Approve',(900,1096),tone='green')
d1.node(1295,795,440,165,'Return for correction',['Creator updates only affected requests','Increment version; revoke old links','Re-enter earliest invalidated approval','Identity / stay / purpose / payer changes'],tone='amber')
d1.edge([(1735,550),(1760,550),(1760,875),(1735,875)],'Return',(1740,720),tone='amber')
d1.edge([(1145,790),(1295,855)],'Return',(1210,805),tone='amber')
d1.edge([(1145,990),(1220,990),(1220,930),(1295,930)],'Return',(1218,957),tone='amber')
d1.edge([(1295,820),(1245,820),(1245,375),(1145,375)],'Revise & resubmit',(1230,420),tone='amber',dashed=True)
d1.node(1295,1110,440,135,'Rejected / declined student',['Reason is recorded; this child stops','Other students in the batch can continue','History is retained'],tone='red')
d1.edge([(1735,600),(1782,600),(1782,1175),(1735,1175)],'Decline',(1755,1050),tone='red',dashed=True)
d1.edge([(1145,1020),(1210,1020),(1210,1175),(1295,1175)],'Reject',(1205,1090),tone='red')
d1.edge([(1145,840),(1180,865),(1180,1210),(1295,1210)],'Office rejects',(1165,1190),tone='red',dashed=True)
d1.footer('All Academics users are eligible. Only the selected faculty recommends. Group rows by student / creator / faculty / batch.')

d2 = Diagram(2, 'Offer, payer access & payment verification', 'CW Office sets the offer; faculty-verified payer identity travels into payment and the invoice', 1350)
d2.node(655,155,490,100,'Chief Warden approved',['From flow 01'],tone='green')
d2.node(590,300,620,170,'CW Office issues the student offer',['Confirm dates, hostel and accommodation charge','Mess: with / without; no food charge invoice','Confirm verified payer; freeze offer + bill-to snapshot'],tag='CW OFFICE')
d2.edge([(900,255),(900,300)])
d2.node(65,325,435,140,'Intern receives stay information',['Email every intern; external email allowed','Dates / hostel / charge / mess preference','Scoped updates to creator and faculty'],tone='neutral')
d2.edge([(590,375),(500,375)],'Always notify intern',(320,300))
d2.decision(900,585,320,150,['Who is the','verified payer?'])
d2.edge([(900,470),(900,510)])
d2.node(85,525,445,175,'Intern pays',['Send intern-scoped expiring access link','Show offer; upload UTR / date / screenshot','Bill-to identity = this intern'],tag='INTERN / STUDENT')
d2.node(1270,525,445,175,'Faculty pays',['Faculty uses authorized view / secure link','Submit payment proof for this student','Bill-to identity = verified faculty'],tag='FACULTY PAYER')
d2.edge([(740,585),(530,585)],'Intern',(635,563))
d2.edge([(1060,585),(1270,585)],'Faculty',(1170,563))
d2.node(655,785,490,130,'Payment proof submitted',['Keep creator, resident and payer distinct','UTR + paid-on date + screenshot','Proof cannot verify itself'],tag='PAYER')
d2.edge([(308,700),(308,750),(790,750),(790,785)])
d2.edge([(1492,700),(1492,750),(1010,750),(1010,785)])
d2.decision(900,1030,340,160,['Accountant verifies','payment proof?'])
d2.edge([(900,915),(900,950)])
d2.node(65,960,445,150,'Proof rejected → correct & resubmit',['Accountant records the reason','Named payer receives correction request','Room assignment waits for verification'],tone='red')
d2.edge([(730,1030),(510,1030)],'No',(620,1010),tone='red')
d2.edge([(285,960),(285,850),(655,850)],'Resubmit proof',(455,825),tone='red',dashed=True)
d2.node(655,1170,490,105,'Payment verified → room assignment',['Continue to flow 03'],tone='green')
d2.edge([(900,1110),(900,1170)],'Yes',(900,1139),tone='green')
d2.node(1270,950,445,170,'Pay-later choice (if offered)',['Does not unlock rooms under current rules','Faculty undertaking exception needs an','explicitly agreed H4 policy'],tone='amber')
d2.footer('One student = one bill in version one. A shared faculty transfer needs an allocation ledger; never credit it in full to every child.')

d3 = Diagram(3, 'Typed room assignment & live warning overrides', 'Any real room in authorized hostel scope can be reviewed. Occupancy warnings are advisory, not prohibitions.', 1760)
d3.node(650,155,500,105,'Ready for room assignment',['Payment verified + hostel allotted','Supervisor is authorized for this hostel'],tone='green',tag='SUPERVISOR')
d3.node(650,310,500,135,'Enter hostel / unit / room number',['Use normal input — no all-room dropdown','Stay window uses approved dates and times','Press Check room / Enter'],tag='SUPERVISOR')
d3.edge([(900,260),(900,310)])
d3.decision(900,550,350,160,['Valid room, dates','and authority?'])
d3.edge([(900,445),(900,470)])
d3.node(1300,475,420,160,'Correct the input / authorization',['Unknown or ambiguous room','Outside assigned hostel scope','Invalid dates or request not ready'],tone='red')
d3.edge([(1075,550),(1300,550)],'No',(1185,529),tone='red')
d3.edge([(1510,475),(1510,365),(1150,365)],'Correct & check again',(1315,341),tone='red',dashed=True)
d3.node(590,680,620,165,'Build live room warnings',['Current resident allocations; presence may be unknown','Overlapping H2 + legacy visitor + H4 reservations','Room status / nominal capacity / placement issues','Exclude this request; honor early/late stay times'],tag='SERVER')
d3.edge([(900,630),(900,680)],'Yes',(900,650),tone='green')
d3.node(65,675,435,190,'Holiday / resident room evidence',['Show who is assigned to the room','Do not infer absence from summer holidays','Current allocations have no dated absence','Never remove the resident allocation'],tone='amber')
d3.edge([(500,770),(590,770)],'Evidence',(548,743),tone='amber',dashed=True)
d3.decision(900,950,320,150,['Any warnings','for this stay?'])
d3.edge([(900,845),(900,875)])
d3.node(80,900,435,130,'No recorded conflicts',['Room is selectable','Proceed to live save-time recheck'],tone='green')
d3.edge([(740,950),(515,950)],'No',(625,928),tone='green')
d3.node(1300,860,425,205,'Review warnings → choose action',['Proceed: acknowledge + explain override','OR choose another room and check again','Resident / guest overlap never blocks H4','Override retains both reservations'],tone='amber',tag='SUPERVISOR')
d3.edge([(1060,950),(1300,950)],'Yes',(1180,928),tone='amber')
d3.edge([(1725,915),(1760,915),(1760,410),(1150,410)],'Choose another room',(1615,670),tone='amber',dashed=True)
d3.node(650,1150,500,140,'Recheck under shared room lock',['Read current conflicts immediately before saving','Compare warning fingerprint + request version','H2 / legacy assignments use the same room lock'],tag='SERVER')
d3.edge([(295,1030),(295,1110),(790,1110),(790,1150)])
d3.edge([(1510,1065),(1510,1110),(1010,1110),(1010,1150)],'Proceed with acknowledgement',(1330,1091),tone='amber')
d3.decision(900,1390,350,160,['Preview still current','and acknowledged?'])
d3.edge([(900,1290),(900,1310)])
d3.node(1300,1310,425,170,'Conditions changed → review again',['Return refreshed warnings','Do not silently save a stale override','Intentional overlap is still allowed'],tone='amber')
d3.edge([(1075,1390),(1300,1390)],'No',(1180,1369),tone='amber')
d3.edge([(1510,1310),(1510,1180),(1250,1180),(1250,800),(1210,800)],'Refresh preview',(1320,1160),tone='amber',dashed=True)
d3.node(610,1530,580,150,'Save dated reservation + override audit',['Actor, time, warnings and reason saved atomically','Leave resident allocation / occupancy / capacity / status intact','Notify intern of the room → continue to flow 04'],tone='green',tag='SERVER + SUPERVISOR')
d3.edge([(900,1470),(900,1530)],'Yes',(900,1494),tone='green')
d3.footer('Normal H2/legacy guest booking remains restrictive and checks H4 reservations. H4 never flips a resident room to Guest or reactivates it.')

d4 = Diagram(4, 'Arrival, stay changes, close-out & payer invoice', 'One student can arrive, extend, move, cancel or settle independently of the rest of the submission batch.', 1730)
d4.node(650,155,500,110,'Room assigned → arrival information',['Intern receives hostel / unit / room','Gate and supervisor see a scoped arrival roster'],tone='green')
d4.node(650,315,500,110,'Check in the individual student',['Gate / authorized supervisor','Store actual arrival when recorded'],tag='GATE / SUPERVISOR')
d4.edge([(900,265),(900,315)])
d4.node(650,490,500,125,'Stay in progress',['Per-student room and stay timeline','Payment state remains separately visible'],tag='SUPERVISOR')
d4.edge([(900,425),(900,490)])
d4.node(65,465,435,235,'Extension / postponement / room move',['CW Office reviews date changes','Rerun conflicts over the new stay window','Material changes re-review affected approvals','Extra charge → payment verification as required','Room move → repeat flow 03 for new room'],tone='amber')
d4.edge([(650,550),(500,550)],'Change requested',(570,528),tone='amber')
d4.edge([(285,700),(285,750),(560,750),(560,590),(650,590)],'Approved update / conflict review',(415,729),tone='amber',dashed=True)
d4.node(1300,465,425,190,'Cancellation / confirmed no-show',['Office records reason and decision','Close only this student’s reservation','Retain payment history','Refund handling stays manual'],tone='red')
d4.edge([(1150,550),(1300,550)],'Office decision',(1225,528),tone='red')
d4.node(650,705,500,115,'Check out / confirmed stay closure',['Record actual departure where available','Scheduled stay end uses the agreed close-out policy'],tag='GATE / OFFICE')
d4.edge([(900,615),(900,705)])
d4.node(610,875,580,135,'Release only the H4 dated reservation',['Release does not wait for invoice generation','Resident allocation and room status remain unchanged','Outstanding money remains on the student’s request'],tone='green')
d4.edge([(900,820),(900,875)])
d4.edge([(1510,655),(1510,940),(1190,940)],'End reservation; retain financial history',(1390,918),tone='red',dashed=True)
d4.decision(900,1135,380,170,['Stay closed and all','required payments settled?'])
d4.edge([(900,1010),(900,1050)])
d4.node(65,1055,435,195,'Balance / proof remains pending',['Keep request available for settlement','Payer submits / corrects proof','Accountant verifies','Reservation is already released'],tone='amber')
d4.edge([(710,1135),(500,1135)],'No',(605,1113),tone='amber')
d4.edge([(285,1250),(285,1290),(620,1290),(620,1165),(777,1165)],'Settled → re-evaluate',(490,1268),tone='amber',dashed=True)
d4.node(655,1310,490,110,'Generate accommodation invoice once',['Unique invoice number + frozen bill-to identity','Keep issued document history'],tone='green',tag='ACCOUNTANT / JOB')
d4.edge([(900,1220),(900,1310)],'Yes',(900,1260),tone='green')
d4.node(100,1485,540,145,'Payer was the intern',['Invoice raised in the intern’s name','Deliver to that intern’s permitted email / access link'],tone='green')
d4.node(1160,1485,540,145,'Payer was faculty',['Invoice raised in verified faculty’s name','Deliver to faculty; creator is not the bill-to identity'],tone='green')
d4.edge([(790,1420),(790,1450),(370,1450),(370,1485)],'Intern',(590,1428),tone='green')
d4.edge([(1010,1420),(1010,1450),(1430,1450),(1430,1485)],'Faculty',(1220,1428),tone='green')
d4.node(1300,1050,425,175,'Mess remains separate',['With / without preference is recorded','Dining roster can be shared as authorized','No food invoice through this portal'],tone='neutral')
d4.footer('Invoice recipient is the verified payer. Cancellation never claims an automatic refund. Payment history remains accessible after the stay ends.')

diagrams = [d1,d2,d3,d4]
files = ['01-approvals','02-payment','03-room-assignment','04-stay-and-invoice']
for filename, diagram in zip(files,diagrams):
    (HERE/f'{filename}.svg').write_text(diagram.svg())
offset = 0
parts = []
for diagram in diagrams:
    parts.append(f'<g transform="translate(0,{offset})">{diagram.body()}</g>')
    offset += diagram.height
(HERE/'detailed-flow.svg').write_text(svg_document(''.join(parts),offset,'H4 accommodation: complete agreed workflow'))
print(f'Created four flow diagrams and combined detailed-flow.svg ({WIDTH} × {offset}).')

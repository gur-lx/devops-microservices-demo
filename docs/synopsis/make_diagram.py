import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

fig, ax = plt.subplots(figsize=(11.5, 7.4), dpi=300)
ax.set_xlim(0, 112)
ax.set_ylim(0, 72)
ax.axis("off")
ax.set_aspect("equal")

PALETTE = {
    "ci":  ("#FDEBD3", "#B9701E"),
    "req": ("#DCEBFC", "#2E5FA3"),
    "svc": ("#EAF7EC", "#2E7D46"),
    "obs": ("#F1EAFB", "#6A3FA0"),
}

def box(x, y, w, h, text, kind, fontsize=9.0):
    fc, ec = PALETTE[kind]
    ax.add_patch(FancyBboxPatch(
        (x, y), w, h,
        boxstyle="round,pad=0.3,rounding_size=2.6",
        linewidth=1.5, edgecolor=ec, facecolor=fc, zorder=2,
    ))
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center",
             fontsize=fontsize, fontweight="bold", color="#1a1a1a", zorder=3,
             linespacing=1.4)
    return (x, y, w, h)

def pt(b, side):
    x, y, w, h = b
    return {
        "right":  (x + w, y + h / 2),
        "left":   (x, y + h / 2),
        "top":    (x + w / 2, y + h),
        "bottom": (x + w / 2, y),
    }[side]

def arrow(p1, p2, color="#5a5a5a", lw=1.5, ls="solid", curve=0.0):
    ax.add_patch(FancyArrowPatch(
        p1, p2, arrowstyle="-|>", mutation_scale=13,
        linewidth=lw, color=color, linestyle=ls,
        connectionstyle=f"arc3,rad={curve}", zorder=1,
    ))

# ---------------------------------------------------------------------------
# Section labels (left margin, rotated) -- helps a reader scan the 4 layers
# ---------------------------------------------------------------------------
def side_label(y_center, text, color):
    ax.text(-3.5, y_center, text, rotation=90, ha="center", va="center",
             fontsize=8.5, fontweight="bold", color=color, style="italic")

# ---------------------------------------------------------------------------
# Row 1 (y=58-66): CI/CD pipeline, with SonarQube quality gate
# ---------------------------------------------------------------------------
dev      = box(4,  58, 15, 8, "Developer\nGit Push",                 "ci")
jenkins  = box(23, 58, 16, 8, "Jenkins\nBuild · Test",           "ci")
sonar    = box(43, 58, 18, 8, "SonarQube\nStatic Code Analysis",      "ci", fontsize=8.6)
registry = box(65, 58, 16, 8, "Docker Hub\nImage Registry",           "ci")

arrow(pt(dev, "right"), pt(jenkins, "left"), color="#B9701E")
arrow(pt(jenkins, "right"), pt(sonar, "left"), color="#B9701E")
arrow(pt(sonar, "right"), pt(registry, "left"), color="#B9701E")
side_label(62, "CI / CD PIPELINE", "#B9701E")

# ---------------------------------------------------------------------------
# Row 2 (y=44-52): request path
# ---------------------------------------------------------------------------
browser  = box(4,  44, 15, 8, "Browser\n(Client)",              "req")
nginx    = box(23, 44, 16, 8, "Nginx (SSL/TLS)\nlearning.run.place", "req", fontsize=8.6)
frontend = box(43, 44, 16, 8, "Frontend\nDashboard",            "req")
gateway  = box(63, 44, 18, 8, "API Gateway\n+ Swagger UI",      "req", fontsize=8.8)

arrow(pt(browser, "right"), pt(nginx, "left"), color="#2E5FA3")
arrow(pt(nginx, "right"), pt(frontend, "left"), color="#2E5FA3")
arrow(pt(frontend, "right"), pt(gateway, "left"), color="#2E5FA3")
side_label(48, "REQUEST PATH", "#2E5FA3")

# deploy: Docker Hub --> API Gateway (the two boxes are already column-aligned,
# so this stays a short, clean vertical connector instead of crossing the row)
arrow(pt(registry, "bottom"), pt(gateway, "top"), color="#B9701E", ls="dashed")
ax.text(84.5, 55.6, "deploy", fontsize=7.6, style="italic", color="#B9701E", ha="center")

# ---------------------------------------------------------------------------
# Row 3 (y=28-36): the microservice mesh, fanned out from the gateway
# ---------------------------------------------------------------------------
svc1 = box(24, 28, 20, 8, "user · product\norder · cart",          "svc", fontsize=8.6)
svc2 = box(46, 28, 20, 8, "inventory · payment\nnotification",          "svc", fontsize=8.6)
svc3 = box(68, 28, 18, 8, "review · auth\nshipping",                    "svc", fontsize=8.6)
svc4 = box(88, 28, 18, 8, "search · analytics",                         "svc", fontsize=8.6)

gw_bottom = pt(gateway, "bottom")
for s in (svc1, svc2, svc3, svc4):
    arrow(gw_bottom, pt(s, "top"), color="#2E7D46", curve=0.0)
side_label(32, "MICROSERVICE MESH", "#2E7D46")

# ---------------------------------------------------------------------------
# Row 4 (y=12-20): observability stack
# ---------------------------------------------------------------------------
prom     = box(30, 12, 17, 8, "Prometheus\nMetrics",        "obs", fontsize=8.6)
promtail = box(49, 12, 15, 8, "Promtail",                   "obs", fontsize=8.6)
loki     = box(66, 12, 15, 8, "Loki\nLogs",                 "obs", fontsize=8.6)
grafana  = box(83, 12, 17, 8, "Grafana\nDashboards",        "obs", fontsize=8.6)

for s in (svc1, svc2):
    arrow(pt(s, "bottom"), pt(prom, "top"), color="#6A3FA0", curve=0.05)
for s in (svc3, svc4):
    arrow(pt(s, "bottom"), pt(promtail, "top"), color="#6A3FA0", curve=-0.05)

arrow(pt(promtail, "right"), pt(loki, "left"), color="#6A3FA0")
arrow(pt(loki, "right"), pt(grafana, "left"), color="#6A3FA0")
arrow(pt(prom, "right"), pt(grafana, "left"), color="#6A3FA0", curve=0.18)
side_label(16, "OBSERVABILITY", "#6A3FA0")

plt.tight_layout(pad=0.4)
plt.savefig("architecture.png", bbox_inches="tight", facecolor="white")
print("saved architecture.png")

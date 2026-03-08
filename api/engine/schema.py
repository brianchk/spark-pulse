"""Cube/member schema registry.

Defines available cubes, their dimensions and measures, and how each member
maps to MongoDB fields and SparkDB SQL expressions. The auto-router uses
source availability to pick the fastest path for each query.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

# ---------------------------------------------------------------------------
# Store ID ↔ display name mappings (shared across sources)
# ---------------------------------------------------------------------------

STORE_ID_TO_NAME: dict[str, str] = {
    "1": "QRE", "25": "LG2", "26": "K11", "40": "RB", "41": "QRC",
    "54": "HC", "68": "GLOW", "77": "MG", "81": "PP",
    "3": "Shopify", "7": "HKTV", "4": "Wholesale",
}

STORE_NAME_TO_ID: dict[str, str] = {v: k for k, v in STORE_ID_TO_NAME.items()}

# SN (int) used in SparkDB histheader.SN
STORE_ID_TO_SN: dict[str, int] = {k: int(k) for k in STORE_ID_TO_NAME}

RETAIL_STORE_IDS = ["1", "25", "26", "40", "41", "54", "68", "77", "81"]

# Categories collapsed to "Other" in SparkDB maincat queries
MAINCAT_OTHER = {"Cash Coupon", "優惠券類", "SUPPLIES", "Others"}


# ---------------------------------------------------------------------------
# Schema data classes
# ---------------------------------------------------------------------------

@dataclass
class MongoSource:
    """How a dimension/measure maps to MongoDB."""
    collection: str
    field: str  # document field path (e.g. "storeId", "transactionDate")


@dataclass
class MongoMeasure:
    """How a measure aggregates in MongoDB."""
    collection: str
    accumulator: dict[str, Any]  # e.g. {"$sum": "$netSalesAll"}


@dataclass
class SqlSource:
    """How a dimension maps to SparkDB SQL."""
    select_expr: str     # SQL expression for SELECT / GROUP BY
    where_column: str    # column used in WHERE clauses
    joins: list[str] = field(default_factory=list)  # required JOIN clauses


@dataclass
class SqlMeasure:
    """How a measure aggregates in SparkDB SQL."""
    expression: str  # SQL aggregation expression


@dataclass
class DimensionDef:
    """A queryable dimension within a cube."""
    name: str                          # short name, e.g. "store"
    member: str                        # full member name, e.g. "sales.store"
    value_type: Literal["string", "number", "time"]
    mongo: MongoSource | None = None   # None = not available in MongoDB
    sql: SqlSource | None = None       # None = not available in SparkDB
    display_map: dict[str, str] | None = None  # raw value → display label


@dataclass
class MeasureDef:
    """A queryable measure within a cube."""
    name: str
    member: str
    value_type: Literal["number"]
    mongo: MongoMeasure | None = None
    sql: SqlMeasure | None = None
    format: str = "number"  # "number", "currency", "percent"


@dataclass
class CubeDef:
    """A logical cube grouping dimensions and measures."""
    name: str
    dimensions: dict[str, DimensionDef]
    measures: dict[str, MeasureDef]

    # SparkDB base tables and standard filters
    sql_from: str = ""
    sql_base_joins: list[str] = field(default_factory=list)
    sql_base_where: str = ""

    # MongoDB default collection
    mongo_collection: str = ""


# ---------------------------------------------------------------------------
# Sales cube definition
# ---------------------------------------------------------------------------

_MONGO_COLL = "transactioncacheaggregations"

# SparkDB base: histheader + histdetail with standard accounting filters
_SQL_FROM = "histheader hh JOIN histdetail hd ON hd.RL = hh.RL"
_SQL_BASE_WHERE = (
    "hh.CF = false AND hh.XT IN (1,14) "
    "AND hd.XT IN (1,14) AND hd.CA = false AND hd.OFG = false AND hd.DK >= 0"
)

# Net revenue formula (SparkDB)
_NR_SQL = (
    "SUM(CAST(((hd.VDA + hd.FCA3 + hd.FCA4 + hd.FCA5) * hd.SD * -1)"
    " * IF(hd.DK < -10, 0, 1) - IFNULL(hd.RS7, 0) AS DECIMAL(24,4)))"
)

SALES_CUBE = CubeDef(
    name="sales",
    mongo_collection=_MONGO_COLL,
    sql_from=_SQL_FROM,
    sql_base_joins=[],
    sql_base_where=_SQL_BASE_WHERE,
    dimensions={
        "store": DimensionDef(
            name="store",
            member="sales.store",
            value_type="string",
            mongo=MongoSource(collection=_MONGO_COLL, field="storeId"),
            sql=SqlSource(select_expr="hh.SN", where_column="hh.SN"),
            display_map=STORE_ID_TO_NAME,
        ),
        "maincat": DimensionDef(
            name="maincat",
            member="sales.maincat",
            value_type="string",
            mongo=None,  # not in MongoDB pre-aggregation
            sql=SqlSource(
                select_expr="cm.D1L",
                where_column="cm.D1L",
                joins=[
                    "JOIN productonsale p ON hd.BC = p.BC",
                    "JOIN cat_main cm ON p.C1 = cm.KY",
                ],
            ),
        ),
        "brand": DimensionDef(
            name="brand",
            member="sales.brand",
            value_type="string",
            mongo=None,
            sql=SqlSource(
                select_expr="br.D1L",
                where_column="br.D1L",
                joins=[
                    "JOIN productonsale p ON hd.BC = p.BC",
                    "JOIN brands br ON p.C3 = br.KY",
                ],
            ),
        ),
        "subcat": DimensionDef(
            name="subcat",
            member="sales.subcat",
            value_type="string",
            mongo=None,
            sql=SqlSource(
                select_expr="cm2.D1L",
                where_column="cm2.D1L",
                joins=[
                    "JOIN productonsale p ON hd.BC = p.BC",
                    "JOIN cat_mid cm2 ON p.C2 = cm2.KY",
                ],
            ),
        ),
        "channel": DimensionDef(
            name="channel",
            member="sales.channel",
            value_type="string",
            # Channel is derived from store ID — available in both sources
            mongo=MongoSource(collection=_MONGO_COLL, field="storeId"),
            sql=SqlSource(select_expr="hh.SN", where_column="hh.SN"),
        ),
        "date": DimensionDef(
            name="date",
            member="sales.date",
            value_type="time",
            mongo=MongoSource(collection=_MONGO_COLL, field="transactionDate"),
            sql=SqlSource(select_expr="DATE(hh.BSD)", where_column="hh.BSD"),
        ),
        "dow": DimensionDef(
            name="dow",
            member="sales.dow",
            value_type="string",
            mongo=None,
            sql=SqlSource(
                select_expr="DAYNAME(hh.BSD)",
                where_column="DAYNAME(hh.BSD)",
            ),
        ),
        "txn_type": DimensionDef(
            name="txn_type",
            member="sales.txn_type",
            value_type="string",
            mongo=None,
            sql=SqlSource(select_expr="hh.XT", where_column="hh.XT"),
        ),
        "payment": DimensionDef(
            name="payment",
            member="sales.payment",
            value_type="string",
            mongo=None,
            sql=SqlSource(select_expr="hh.PM", where_column="hh.PM"),
        ),
        "staff": DimensionDef(
            name="staff",
            member="sales.staff",
            value_type="string",
            mongo=None,
            sql=SqlSource(select_expr="hh.OP", where_column="hh.OP"),
        ),
    },
    measures={
        "net_revenue": MeasureDef(
            name="net_revenue",
            member="sales.net_revenue",
            value_type="number",
            mongo=MongoMeasure(collection=_MONGO_COLL, accumulator={"$sum": "$netSalesAll"}),
            sql=SqlMeasure(expression=_NR_SQL),
            format="currency",
        ),
        "transaction_count": MeasureDef(
            name="transaction_count",
            member="sales.transaction_count",
            value_type="number",
            mongo=MongoMeasure(collection=_MONGO_COLL, accumulator={"$sum": "$transactionCountAll"}),
            sql=SqlMeasure(expression="COUNT(DISTINCT hh.RL)"),
        ),
    },
)


# ---------------------------------------------------------------------------
# Registry: all cubes
# ---------------------------------------------------------------------------

CUBES: dict[str, CubeDef] = {
    "sales": SALES_CUBE,
}


def get_cube(name: str) -> CubeDef | None:
    return CUBES.get(name)


def resolve_member(member: str) -> tuple[CubeDef, DimensionDef | MeasureDef] | None:
    """Resolve 'sales.store' → (CubeDef, DimensionDef)."""
    parts = member.split(".", 1)
    if len(parts) != 2:
        return None
    cube = CUBES.get(parts[0])
    if cube is None:
        return None
    dim = cube.dimensions.get(parts[1])
    if dim:
        return (cube, dim)
    meas = cube.measures.get(parts[1])
    if meas:
        return (cube, meas)
    return None

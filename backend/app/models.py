from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, JSON, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


Money = Numeric(14, 2, asdecimal=True)
Rate = Numeric(12, 6, asdecimal=True)


class RateList(Base):
    __tablename__ = "rate_lists"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    country: Mapped[str] = mapped_column(String(80), nullable=False, default="England")
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active")
    calculation_strategy: Mapped[str] = mapped_column(String(80), nullable=False)
    start_date: Mapped[object] = mapped_column(Date, nullable=False)
    end_date: Mapped[object] = mapped_column(Date, nullable=False)
    source_url: Mapped[str | None] = mapped_column(Text)
    source_note: Mapped[str | None] = mapped_column(Text)
    verified_on: Mapped[object | None] = mapped_column(Date)

    years: Mapped[list["RateYear"]] = relationship(
        back_populates="rate_list", cascade="all, delete-orphan", order_by="RateYear.start_date"
    )
    transition_bands: Mapped[list["TransitionBand"]] = relationship(
        back_populates="rate_list", cascade="all, delete-orphan", order_by="TransitionBand.id"
    )
    advanced_rule_set: Mapped["AdvancedRuleSet | None"] = relationship(
        back_populates="rate_list", cascade="all, delete-orphan", uselist=False
    )


class RateYear(Base):
    __tablename__ = "rate_years"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rate_list_id: Mapped[int] = mapped_column(ForeignKey("rate_lists.id"), nullable=False)
    label: Mapped[str] = mapped_column(String(16), nullable=False)
    start_date: Mapped[object] = mapped_column(Date, nullable=False)
    end_date: Mapped[object] = mapped_column(Date, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    inflation_factor: Mapped[object] = mapped_column(Rate, nullable=False, default=1)
    source_url: Mapped[str | None] = mapped_column(Text)
    source_note: Mapped[str | None] = mapped_column(Text)

    rate_list: Mapped[RateList] = relationship(back_populates="years")
    multiplier_tiers: Mapped[list["MultiplierTier"]] = relationship(
        back_populates="rate_year", cascade="all, delete-orphan", order_by="MultiplierTier.id"
    )
    transition_caps: Mapped[list["TransitionCap"]] = relationship(
        back_populates="rate_year", cascade="all, delete-orphan", order_by="TransitionCap.id"
    )
    supplements: Mapped[list["SupplementRule"]] = relationship(
        back_populates="rate_year", cascade="all, delete-orphan", order_by="SupplementRule.id"
    )


class MultiplierTier(Base):
    __tablename__ = "multiplier_tiers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rate_year_id: Mapped[int] = mapped_column(ForeignKey("rate_years.id"), nullable=False)
    code: Mapped[str] = mapped_column(String(80), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    min_rv: Mapped[object | None] = mapped_column(Money)
    max_rv: Mapped[object | None] = mapped_column(Money)
    min_inclusive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    max_inclusive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    rhl_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    rate: Mapped[object] = mapped_column(Rate, nullable=False)

    rate_year: Mapped[RateYear] = relationship(back_populates="multiplier_tiers")


class TransitionBand(Base):
    __tablename__ = "transition_bands"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rate_list_id: Mapped[int] = mapped_column(ForeignKey("rate_lists.id"), nullable=False)
    location_group: Mapped[str] = mapped_column(String(32), nullable=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    min_rv: Mapped[object | None] = mapped_column(Money)
    max_rv: Mapped[object | None] = mapped_column(Money)
    min_inclusive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    max_inclusive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    rate_list: Mapped[RateList] = relationship(back_populates="transition_bands")


class TransitionCap(Base):
    __tablename__ = "transition_caps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rate_year_id: Mapped[int] = mapped_column(ForeignKey("rate_years.id"), nullable=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    cap_percent: Mapped[object] = mapped_column(Rate, nullable=False)
    inflation_factor: Mapped[object] = mapped_column(Rate, nullable=False, default=1)
    appropriate_fraction: Mapped[object] = mapped_column(Rate, nullable=False)

    rate_year: Mapped[RateYear] = relationship(back_populates="transition_caps")


class SupplementRule(Base):
    __tablename__ = "supplement_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rate_year_id: Mapped[int] = mapped_column(ForeignKey("rate_years.id"), nullable=False)
    code: Mapped[str] = mapped_column(String(80), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    location_scope: Mapped[str] = mapped_column(String(32), nullable=False, default="any")
    min_rv: Mapped[object | None] = mapped_column(Money)
    max_rv: Mapped[object | None] = mapped_column(Money)
    min_inclusive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    max_inclusive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    rate: Mapped[object] = mapped_column(Rate, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    source_url: Mapped[str | None] = mapped_column(Text)
    source_note: Mapped[str | None] = mapped_column(Text)

    rate_year: Mapped[RateYear] = relationship(back_populates="supplements")


class AdvancedRuleSet(Base):
    __tablename__ = "advanced_rule_sets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rate_list_id: Mapped[int] = mapped_column(ForeignKey("rate_lists.id"), unique=True, nullable=False)
    rules_json: Mapped[dict] = mapped_column(JSON, nullable=False)

    rate_list: Mapped[RateList] = relationship(back_populates="advanced_rule_set")


class Scenario(Base):
    __tablename__ = "scenarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    request_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    result_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[object] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class AdvancedScenario(Base):
    __tablename__ = "advanced_scenarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    request_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    result_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[object] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

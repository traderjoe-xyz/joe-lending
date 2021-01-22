
# Run a single cvl e.g.:
#  make -B spec/certora/CErc20/borrowAndRepayFresh.cvl

# TODO:
#  - mintAndRedeemFresh.cvl in progress and is failing due to issues with tool proving how the exchange rate can change
#    hoping for better division modelling - currently fails to prove (a + 1) / b >= a / b
#  - CErc20Delegator/*.cvl cannot yet be run with the tool

.PHONY: certora-clean

CERTORA_BIN = $(abspath script/certora)
CERTORA_RUN = $(CERTORA_BIN)/run.py
CERTORA_CLI = $(CERTORA_BIN)/cli.jar
CERTORA_EMV = $(CERTORA_BIN)/emv.jar

export CERTORA = $(CERTORA_BIN)
export CERTORA_DISABLE_POPUP = 1

spec/certora/Math/%.cvl:
	$(CERTORA_RUN) \
	 spec/certora/contracts/MathCertora.sol \
	--verify \
	 MathCertora:$@

spec/certora/Comp/search.cvl:
	$(CERTORA_RUN) \
	spec/certora/contracts/CompCertora.sol \
	--settings -b=4,-graphDrawLimit=0,-assumeUnwindCond,-depth=100 \
	--solc_args "'--evm-version istanbul'" \
	--verify \
	 CompCertora:$@

spec/certora/Comp/transfer.cvl:
	$(CERTORA_RUN) \
	spec/certora/contracts/CompCertora.sol \
	--settings -graphDrawLimit=0,-assumeUnwindCond,-depth=100 \
	--solc_args "'--evm-version istanbul'" \
	--verify \
	 CompCertora:$@

spec/certora/Comptroller/%.cvl:
	$(CERTORA_RUN) \
	 spec/certora/contracts/ComptrollerCertora.sol \
	 spec/certora/contracts/PriceOracleModel.sol \
	--link \
	 ComptrollerCertora:oracle=PriceOracleModel \
	--verify \
	 ComptrollerCertora:$@

spec/certora/CErc20/%.cvl:
	$(CERTORA_RUN) \
	 spec/certora/contracts/CErc20ImmutableCertora.sol \
	 spec/certora/contracts/CTokenCollateral.sol \
	 spec/certora/contracts/ComptrollerCertora.sol \
	 spec/certora/contracts/InterestRateModelModel.sol \
	 spec/certora/contracts/UnderlyingModelNonStandard.sol \
	--link \
	 CErc20ImmutableCertora:otherToken=CTokenCollateral \
	 CErc20ImmutableCertora:comptroller=ComptrollerCertora \
	 CErc20ImmutableCertora:underlying=UnderlyingModelNonStandard \
	 CErc20ImmutableCertora:interestRateModel=InterestRateModelModel \
	 CTokenCollateral:comptroller=ComptrollerCertora \
	 CTokenCollateral:underlying=UnderlyingModelNonStandard \
	--verify \
	 CErc20ImmutableCertora:$@ \
	--settings -cache=certora-run-cerc20-immutable

spec/certora/CErc20Delegator/%.cvl:
	$(CERTORA_RUN) \
	 spec/certora/contracts/CErc20DelegatorCertora.sol \
	 spec/certora/contracts/CErc20DelegateCertora.sol \
	 spec/certora/contracts/CTokenCollateral.sol \
	 spec/certora/contracts/ComptrollerCertora.sol \
	 spec/certora/contracts/InterestRateModelModel.sol \
	 spec/certora/contracts/UnderlyingModelNonStandard.sol \
	--link \
	 CErc20DelegatorCertora:implementation=CErc20DelegateCertora \
	 CErc20DelegatorCertora:otherToken=CTokenCollateral \
	 CErc20DelegatorCertora:comptroller=ComptrollerCertora \
	 CErc20DelegatorCertora:underlying=UnderlyingModelNonStandard \
	 CErc20DelegatorCertora:interestRateModel=InterestRateModelModel \
	 CTokenCollateral:comptroller=ComptrollerCertora \
	 CTokenCollateral:underlying=UnderlyingModelNonStandard \
	--verify \
	 CErc20DelegatorCertora:$@ \
	--settings -assumeUnwindCond \
	--settings -cache=certora-run-cerc20-delegator

spec/certora/Timelock/%.cvl:
	$(CERTORA_RUN) \
	 spec/certora/contracts/TimelockCertora.sol \
	--verify \
	 TimelockCertora:$@

certora-clean:
	rm -rf .certora_build.json .certora_config certora_verify.json emv-*

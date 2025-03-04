//import useENS from 'hooks/useENS';
import { parseUnits } from '@ethersproject/units';
import {
  ChainId,
  Currency,
  CurrencyAmount,
  ETHER,
  JSBI,
  Token,
  TokenAmount,
  Trade,
} from '@uniswap/sdk';
import { ParsedQs } from 'qs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useActiveWeb3React } from 'hooks';
import { useCurrency } from 'hooks/Tokens';
import useParsedQueryString from 'hooks/useParsedQueryString';
import { isAddress } from 'utils';
import { AppDispatch, AppState } from 'state';
import { useCurrencyBalances } from 'state/wallet/hooks';
import {
  Field,
  replaceSwapState,
  RouterTypeParams,
  selectCurrency,
  setBestRoute,
  setRecipient,
  setSwapDelay,
  SwapDelay,
  switchCurrencies,
  typeInput,
} from './actions';
import { SwapState } from './reducer';
import {
  useSlippageManuallySet,
  useUserSlippageTolerance,
} from 'state/user/hooks';
import { computeSlippageAdjustedAmounts } from 'utils/prices';
import { GlobalData, RouterTypes, SmartRouter } from 'constants/index';
import useFindBestRoute from 'hooks/useFindBestRoute';

export function useSwapState(): AppState['swap'] {
  return useSelector<AppState, AppState['swap']>((state) => state.swap);
}

export function useSwapActionHandlers(): {
  onCurrencySelection: (field: Field, currency: Currency) => void;
  onSwitchTokens: () => void;
  onUserInput: (field: Field, typedValue: string) => void;
  onChangeRecipient: (recipient: string | null) => void;
  onSetSwapDelay: (swapDelay: SwapDelay) => void;
  onBestRoute: (bestRoute: RouterTypeParams) => void;
} {
  const dispatch = useDispatch<AppDispatch>();
  const { chainId } = useActiveWeb3React();
  const chainIdToUse = chainId ? chainId : ChainId.MATIC;
  const nativeCurrency = ETHER[chainIdToUse];
  const timer = useRef<any>(null);

  const onCurrencySelection = useCallback(
    (field: Field, currency: Currency) => {
      dispatch(
        selectCurrency({
          field,
          currencyId:
            currency instanceof Token
              ? currency.address
              : currency === nativeCurrency
              ? 'ETH'
              : '',
        }),
      );
    },
    [dispatch, nativeCurrency],
  );

  const onSetSwapDelay = useCallback(
    (swapDelay: SwapDelay) => {
      dispatch(setSwapDelay({ swapDelay }));
    },
    [dispatch],
  );

  const onSwitchTokens = useCallback(() => {
    dispatch(switchCurrencies());
  }, [dispatch]);

  const onUserInput = useCallback(
    (field: Field, typedValue: string) => {
      dispatch(typeInput({ field, typedValue }));
      if (!typedValue) {
        onSetSwapDelay(SwapDelay.INIT);
        return;
      }
      onSetSwapDelay(SwapDelay.USER_INPUT);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        onSetSwapDelay(SwapDelay.USER_INPUT_COMPLETE);
      }, 300);
    },
    [dispatch, onSetSwapDelay],
  );

  const onChangeRecipient = useCallback(
    (recipient: string | null) => {
      dispatch(setRecipient({ recipient }));
    },
    [dispatch],
  );

  const onBestRoute = useCallback(
    (bestRoute: RouterTypeParams) => {
      dispatch(setBestRoute({ bestRoute }));
    },
    [dispatch],
  );

  return {
    onSwitchTokens,
    onCurrencySelection,
    onUserInput,
    onChangeRecipient,
    onSetSwapDelay,
    onBestRoute,
  };
}

// try to parse a user entered amount for a given token
export function tryParseAmount(
  chainId: ChainId,
  value?: string,
  currency?: Currency,
): CurrencyAmount | undefined {
  if (!value || !currency) {
    return undefined;
  }
  try {
    const typedValueParsed = parseUnits(value, currency.decimals).toString();
    if (typedValueParsed !== '0') {
      return currency instanceof Token
        ? new TokenAmount(currency, JSBI.BigInt(typedValueParsed))
        : CurrencyAmount.ether(JSBI.BigInt(typedValueParsed), chainId); // TODO: CHANGE THIS
    }
  } catch (error) {
    // should fail if the user specifies too many decimal places of precision (or maybe exceed max uint?)
    console.debug(`Failed to parse input amount: "${value}"`, error);
  }
  // necessary for all paths to return a value
  return undefined;
}

const BAD_RECIPIENT_ADDRESSES: string[] = [
  '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f', // v2 factory
  '0xf164fC0Ec4E93095b804a4795bBe1e041497b92a', // v2 router 01
  '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', // v2 router 02
];

/**
 * Returns true if any of the pairs or tokens in a trade have the given checksummed address
 * @param trade to check for the given address
 * @param checksummedAddress address to check in the pairs and tokens
 */
function involvesAddress(trade: Trade, checksummedAddress: string): boolean {
  return (
    trade.route.path.some((token) => token.address === checksummedAddress) ||
    trade.route.pairs.some(
      (pair) => pair.liquidityToken.address === checksummedAddress,
    )
  );
}

// from the current swap inputs, compute the best trade and return it.
export function useDerivedSwapInfo(): {
  currencies: { [field in Field]?: Currency };
  currencyBalances: { [field in Field]?: CurrencyAmount };
  parsedAmount: CurrencyAmount | undefined;
  v2Trade: Trade | undefined;
  inputError?: string;
  v1Trade: Trade | undefined;
} {
  const { account, chainId } = useActiveWeb3React();
  const chainIdToUse = chainId ?? ChainId.MATIC;
  const parsedQuery = useParsedQueryString();
  const swapType = parsedQuery ? parsedQuery.swapIndex : undefined;

  const {
    independentField,
    typedValue,
    [Field.INPUT]: { currencyId: inputCurrencyId },
    [Field.OUTPUT]: { currencyId: outputCurrencyId },
    recipient,
  } = useSwapState();

  const inputCurrency = useCurrency(inputCurrencyId);
  const outputCurrency = useCurrency(outputCurrencyId);
  //const recipientLookup = useENS(recipient ?? undefined);
  const to: string | null = (recipient === null ? account : recipient) ?? null;

  const relevantTokenBalances = useCurrencyBalances(account ?? undefined, [
    inputCurrency ?? undefined,
    outputCurrency ?? undefined,
  ]);

  const isExactIn: boolean = independentField === Field.INPUT;
  const parsedAmount = tryParseAmount(
    chainIdToUse,
    typedValue,
    (isExactIn ? inputCurrency : outputCurrency) ?? undefined,
  );

  const { v2Trade, bestTradeExactIn, bestTradeExactOut } = useFindBestRoute();

  const currencyBalances = {
    [Field.INPUT]: relevantTokenBalances[0],
    [Field.OUTPUT]: relevantTokenBalances[1],
  };

  const currencies: { [field in Field]?: Currency } = {
    [Field.INPUT]: inputCurrency ?? undefined,
    [Field.OUTPUT]: outputCurrency ?? undefined,
  };

  let inputError: string | undefined;
  if (!account) {
    inputError = 'Connect Wallet';
  }

  if (!parsedAmount) {
    inputError = inputError ?? 'Enter an amount';
  }

  if (!currencies[Field.INPUT] || !currencies[Field.OUTPUT]) {
    inputError = inputError ?? 'Select a token';
  }

  const formattedTo = isAddress(to);
  if (!to || !formattedTo) {
    inputError = inputError ?? 'Enter a recipient';
  } else {
    if (
      BAD_RECIPIENT_ADDRESSES.indexOf(formattedTo) !== -1 ||
      (bestTradeExactIn && involvesAddress(bestTradeExactIn, formattedTo)) ||
      (bestTradeExactOut && involvesAddress(bestTradeExactOut, formattedTo))
    ) {
      inputError = inputError ?? 'Invalid recipient';
    }
  }

  const [
    allowedSlippage,
    setUserSlippageTolerance,
  ] = useUserSlippageTolerance();
  const [slippageManuallySet] = useSlippageManuallySet();

  const slippageAdjustedAmounts =
    v2Trade &&
    allowedSlippage &&
    computeSlippageAdjustedAmounts(v2Trade, allowedSlippage);

  // compare input balance to max input based on version
  const [balanceIn, amountIn] = [
    currencyBalances[Field.INPUT],
    slippageAdjustedAmounts ? slippageAdjustedAmounts[Field.INPUT] : null,
  ];

  if (
    swapType !== '0' &&
    balanceIn &&
    amountIn &&
    balanceIn.lessThan(amountIn)
  ) {
    inputError = 'Insufficient ' + amountIn.currency.symbol + ' balance';
  }

  useEffect(() => {
    const stableCoins = GlobalData.stableCoins[chainIdToUse];
    const stableCoinAddresses =
      stableCoins && stableCoins.length > 0
        ? stableCoins.map((token) => token.address.toLowerCase())
        : [];
    if (!slippageManuallySet) {
      if (
        inputCurrencyId &&
        outputCurrencyId &&
        stableCoinAddresses.includes(inputCurrencyId.toLowerCase()) &&
        stableCoinAddresses.includes(outputCurrencyId.toLowerCase())
      ) {
        setUserSlippageTolerance(10);
      } else {
        setUserSlippageTolerance(50);
      }
    }
  }, [
    inputCurrencyId,
    outputCurrencyId,
    setUserSlippageTolerance,
    chainIdToUse,
    slippageManuallySet,
  ]);

  return {
    currencies,
    currencyBalances,
    parsedAmount,
    v2Trade: v2Trade ?? undefined,
    inputError,
    v1Trade: undefined,
  };
}

function parseCurrencyFromURLParameter(urlParam: any): string {
  if (typeof urlParam === 'string') {
    const valid = isAddress(urlParam);
    if (valid) return valid;
    if (urlParam.toUpperCase() === 'ETH') return 'ETH';
    if (valid === false) return 'ETH';
  }
  return '';
}

function parseTokenAmountURLParameter(urlParam: any): string {
  return typeof urlParam === 'string' && !isNaN(parseFloat(urlParam))
    ? urlParam
    : '';
}

function parseIndependentFieldURLParameter(urlParam: any): Field {
  return typeof urlParam === 'string' && urlParam.toLowerCase() === 'output'
    ? Field.OUTPUT
    : Field.INPUT;
}

const ENS_NAME_REGEX = /^[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)?$/;
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
function validatedRecipient(recipient: any): string | null {
  if (typeof recipient !== 'string') return null;
  const address = isAddress(recipient);
  if (address) return address;
  if (ENS_NAME_REGEX.test(recipient)) return recipient;
  if (ADDRESS_REGEX.test(recipient)) return recipient;
  return null;
}

export function queryParametersToSwapState(parsedQs: ParsedQs): SwapState {
  let inputCurrency = parseCurrencyFromURLParameter(
    parsedQs.currency0 ?? parsedQs.inputCurrency,
  );
  let outputCurrency = parseCurrencyFromURLParameter(
    parsedQs.currency1 ?? parsedQs.outputCurrency,
  );
  if (inputCurrency === outputCurrency) {
    if (typeof parsedQs.outputCurrency === 'string') {
      inputCurrency = '';
    } else {
      outputCurrency = '';
    }
  }

  const recipient = validatedRecipient(parsedQs.recipient);

  return {
    [Field.INPUT]: {
      currencyId: inputCurrency,
    },
    [Field.OUTPUT]: {
      currencyId: outputCurrency,
    },
    typedValue: parseTokenAmountURLParameter(parsedQs.exactAmount),
    independentField: parseIndependentFieldURLParameter(parsedQs.exactField),
    recipient,
    swapDelay: SwapDelay.INIT,
    bestRoute: {
      routerType: RouterTypes.QUICKSWAP,
      smartRouter: SmartRouter.QUICKSWAP,
    },
  };
}

// updates the swap state to use the defaults for a given network
export function useDefaultsFromURLSearch():
  | {
      inputCurrencyId: string | undefined;
      outputCurrencyId: string | undefined;
    }
  | undefined {
  const { chainId } = useActiveWeb3React();
  const dispatch = useDispatch<AppDispatch>();
  const parsedQs = useParsedQueryString();
  const [result, setResult] = useState<
    | {
        inputCurrencyId: string | undefined;
        outputCurrencyId: string | undefined;
      }
    | undefined
  >();

  useEffect(() => {
    if (!chainId) return;
    const parsed = queryParametersToSwapState(parsedQs);

    dispatch(
      replaceSwapState({
        typedValue: parsed.typedValue,
        field: parsed.independentField,
        inputCurrencyId: parsed[Field.INPUT].currencyId,
        outputCurrencyId: parsed[Field.OUTPUT].currencyId,
        recipient: parsed.recipient,
        swapDelay: SwapDelay.INIT,
        bestRoute: {
          routerType: RouterTypes.QUICKSWAP,
          smartRouter: SmartRouter.QUICKSWAP,
        },
      }),
    );

    setResult({
      inputCurrencyId: parsed[Field.INPUT].currencyId,
      outputCurrencyId: parsed[Field.OUTPUT].currencyId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, chainId]);

  return result;
}
